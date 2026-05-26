import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, Uuid } from '@rankpulse/shared';
import {
	aProject,
	InMemoryCompetitorRepository,
	InMemoryProjectRepository,
	RecordingEventPublisher,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddCompetitorUseCase } from './add-competitor.use-case.js';

describe('AddCompetitorUseCase', () => {
	let projects: InMemoryProjectRepository;
	let competitors: InMemoryCompetitorRepository;
	let clock: FakeClock;
	let ids: FixedIdGenerator;
	let events: RecordingEventPublisher;
	let useCase: AddCompetitorUseCase;
	let project: ProjectManagement.Project;

	const orgId = Uuid.generate() as IdentityAccess.OrganizationId;
	const competitorId = Uuid.generate();

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		competitors = new InMemoryCompetitorRepository();
		clock = new FakeClock('2026-05-04T10:00:00Z');
		ids = new FixedIdGenerator([competitorId]);
		events = new RecordingEventPublisher();
		useCase = new AddCompetitorUseCase(projects, competitors, clock, ids, events);

		project = aProject({ organizationId: orgId });
		await projects.save(project);
	});

	it('persists a competitor and publishes CompetitorAdded on first add', async () => {
		const result = await useCase.execute({
			projectId: project.id,
			domain: 'vigilant.es',
			label: 'Vigilant',
		});

		expect(result.competitorId).toBe(competitorId);
		expect(result.created).toBe(true);
		const list = await competitors.listForProject(project.id);
		expect(list).toHaveLength(1);
		expect(list[0]?.label).toBe('Vigilant');
		expect(events.publishedTypes()).toContain('project-management.CompetitorAdded');
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: Uuid.generate(), domain: 'vigilant.es' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	// Idempotency contract: re-adding an existing competitor MUST return the
	// existing id and re-publish CompetitorAdded so the auto-schedule
	// handlers can backfill any feeders missing from the JobDefinition table
	// (operator cleanup, late-arriving handler, etc.). Pre-fix this threw
	// ConflictError, forcing operators into a DELETE + POST cycle that
	// destroyed wayback + backlinks run history.
	it('is idempotent: re-adding existing competitor returns same id without throwing', async () => {
		const first = await useCase.execute({
			projectId: project.id,
			domain: 'vigilant.es',
			label: 'Vigilant',
		});

		ids = new FixedIdGenerator([Uuid.generate()]); // would-be new id
		const refeed = new AddCompetitorUseCase(projects, competitors, clock, ids, events);
		const second = await refeed.execute({ projectId: project.id, domain: 'vigilant.es' });

		expect(second.competitorId).toBe(first.competitorId);
		expect(second.created).toBe(false);
		const list = await competitors.listForProject(project.id);
		expect(list).toHaveLength(1);
	});

	it('re-emits CompetitorAdded on the idempotent path so auto-schedule handlers can backfill', async () => {
		await useCase.execute({ projectId: project.id, domain: 'vigilant.es' });
		const firstEventCount = events
			.publishedTypes()
			.filter((t) => t === 'project-management.CompetitorAdded').length;
		expect(firstEventCount).toBe(1);

		const refeed = new AddCompetitorUseCase(projects, competitors, clock, ids, events);
		await refeed.execute({ projectId: project.id, domain: 'vigilant.es' });

		const totalEventCount = events
			.publishedTypes()
			.filter((t) => t === 'project-management.CompetitorAdded').length;
		expect(totalEventCount).toBe(2);
	});

	it('preserves the existing competitor label on the idempotent path (does not overwrite with cmd.label)', async () => {
		await useCase.execute({
			projectId: project.id,
			domain: 'vigilant.es',
			label: 'Original Label',
		});

		const refeed = new AddCompetitorUseCase(projects, competitors, clock, ids, events);
		const result = await refeed.execute({
			projectId: project.id,
			domain: 'vigilant.es',
			label: 'Tried To Rename',
		});

		expect(result.created).toBe(false);
		const list = await competitors.listForProject(project.id);
		expect(list[0]?.label).toBe('Original Label');
	});
});
