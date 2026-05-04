import { type IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, InvalidInputError, Uuid } from '@rankpulse/shared';
import { InMemoryProjectRepository, RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CreateProjectUseCase } from './create-project.use-case.js';

describe('CreateProjectUseCase', () => {
	let projects: InMemoryProjectRepository;
	let clock: FakeClock;
	let ids: FixedIdGenerator;
	let events: RecordingEventPublisher;
	let useCase: CreateProjectUseCase;

	const orgId = Uuid.generate() as IdentityAccess.OrganizationId;
	const projectId = Uuid.generate();

	beforeEach(() => {
		projects = new InMemoryProjectRepository();
		clock = new FakeClock('2026-05-04T10:00:00Z');
		ids = new FixedIdGenerator([projectId]);
		events = new RecordingEventPublisher();
		useCase = new CreateProjectUseCase(projects, clock, ids, events);
	});

	it('creates the project with primary domain and initial location', async () => {
		const result = await useCase.execute({
			organizationId: orgId,
			portfolioId: null,
			name: 'PatrolTech',
			primaryDomain: 'controlrondas.com',
			initialLocations: [{ country: 'ES', language: 'es' }],
		});

		expect(result.projectId).toBe(projectId);
		const stored = await projects.findById(projectId as ProjectManagement.ProjectId);
		expect(stored?.primaryDomain.value).toBe('controlrondas.com');
		expect(stored?.locations).toHaveLength(1);
		expect(stored?.domains.find((d) => d.kind === 'main')?.domain.value).toBe('controlrondas.com');
	});

	it('publishes ProjectCreated and LocationAdded events', async () => {
		await useCase.execute({
			organizationId: orgId,
			portfolioId: null,
			name: 'PatrolTech',
			primaryDomain: 'controlrondas.com',
			initialLocations: [{ country: 'ES', language: 'es' }],
		});

		expect(events.publishedTypes()).toEqual(expect.arrayContaining(['project-management.ProjectCreated']));
	});

	it('rejects an invalid domain without persisting anything', async () => {
		await expect(
			useCase.execute({
				organizationId: orgId,
				portfolioId: null,
				name: 'Bad',
				primaryDomain: 'not a domain',
			}),
		).rejects.toBeInstanceOf(InvalidInputError);
		expect(projects.size()).toBe(0);
		expect(events.published()).toHaveLength(0);
	});

	it('rejects when the same primary domain already exists in the org', async () => {
		const existing = ProjectManagement.Project.create({
			id: Uuid.generate() as ProjectManagement.ProjectId,
			organizationId: orgId,
			portfolioId: null,
			name: 'First',
			primaryDomain: ProjectManagement.DomainName.create('controlrondas.com'),
			now: clock.now(),
		});
		await projects.save(existing);

		await expect(
			useCase.execute({
				organizationId: orgId,
				portfolioId: null,
				name: 'Duplicate',
				primaryDomain: 'controlrondas.com',
			}),
		).rejects.toBeInstanceOf(ConflictError);
	});
});
