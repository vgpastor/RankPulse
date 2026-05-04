import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, NotFoundError, Uuid } from '@rankpulse/shared';
import {
	InMemoryCompetitorRepository,
	InMemoryProjectRepository,
	RecordingEventPublisher,
	aProject,
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

	it('persists a competitor, publishes CompetitorAdded', async () => {
		const result = await useCase.execute({
			projectId: project.id,
			domain: 'vigilant.es',
			label: 'Vigilant',
		});

		expect(result.competitorId).toBe(competitorId);
		const list = await competitors.listForProject(project.id);
		expect(list).toHaveLength(1);
		expect(list[0]?.label).toBe('Vigilant');
		expect(events.publishedTypes()).toContain('project-management.CompetitorAdded');
	});

	it('rejects when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: Uuid.generate(), domain: 'vigilant.es' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('rejects duplicate competitor domains for the same project', async () => {
		await useCase.execute({ projectId: project.id, domain: 'vigilant.es' });
		ids = new FixedIdGenerator([Uuid.generate()]);
		const duplicateUseCase = new AddCompetitorUseCase(projects, competitors, clock, ids, events);
		await expect(
			duplicateUseCase.execute({ projectId: project.id, domain: 'vigilant.es' }),
		).rejects.toBeInstanceOf(ConflictError);
	});
});
