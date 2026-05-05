import type { ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, NotFoundError, Uuid } from '@rankpulse/shared';
import { aDomain, aProject, InMemoryProjectRepository, RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddDomainToProjectUseCase } from './add-domain-to-project.use-case.js';

describe('AddDomainToProjectUseCase', () => {
	let projects: InMemoryProjectRepository;
	let clock: FakeClock;
	let events: RecordingEventPublisher;
	let useCase: AddDomainToProjectUseCase;
	let project: ProjectManagement.Project;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		clock = new FakeClock('2026-05-04T10:00:00Z');
		events = new RecordingEventPublisher();
		useCase = new AddDomainToProjectUseCase(projects, clock, events);
		project = aProject();
		await projects.save(project);
	});

	it('appends a new alias domain and emits DomainAdded', async () => {
		await useCase.execute({ projectId: project.id, domain: 'controlrondas.mx', kind: 'alias' });

		const stored = await projects.findById(project.id);
		expect(stored?.domains.map((d) => d.domain.value)).toContain('controlrondas.mx');
		expect(events.publishedTypes()).toContain('project-management.DomainAdded');
	});

	it('rejects when the project does not exist', async () => {
		await expect(useCase.execute({ projectId: Uuid.generate(), domain: 'x.com' })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it('rejects when the same domain is already attached to THIS project', async () => {
		await useCase.execute({ projectId: project.id, domain: 'controlrondas.mx' });
		await expect(
			useCase.execute({ projectId: project.id, domain: 'controlrondas.mx' }),
		).rejects.toMatchObject({
			constructor: ConflictError,
			message: expect.stringMatching(/already attached to this project/),
		});
	});

	it('rejects with the OWNER project name when the domain belongs to another project of the same org (BACKLOG #24)', async () => {
		const otherProject = aProject({
			id: Uuid.generate() as ProjectManagement.ProjectId,
			organizationId: project.organizationId,
			name: 'PatrolTech ES',
			primaryDomain: aDomain('patroltech.online'),
		});
		await projects.save(otherProject);

		await expect(
			useCase.execute({ projectId: project.id, domain: 'patroltech.online' }),
		).rejects.toMatchObject({
			constructor: ConflictError,
			message: expect.stringMatching(/already attached to project "PatrolTech ES"/),
		});
	});
});
