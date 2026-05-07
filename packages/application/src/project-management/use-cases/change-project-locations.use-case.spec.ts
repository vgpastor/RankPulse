import { type IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryProjectRepository, RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddProjectLocationUseCase } from './change-project-locations.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PORTFOLIO_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd' as Uuid as ProjectManagement.PortfolioId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

const buildProject = (): ProjectManagement.Project =>
	ProjectManagement.Project.create({
		id: PROJECT_ID,
		organizationId: ORG_ID,
		portfolioId: PORTFOLIO_ID,
		name: 'Acme',
		primaryDomain: ProjectManagement.DomainName.create('acme.com'),
		initialLocations: [ProjectManagement.LocationLanguage.create({ country: 'ES', language: 'es' })],
		now: new Date('2026-05-04T10:00:00Z'),
	});

describe('AddProjectLocationUseCase', () => {
	let repo: InMemoryProjectRepository;
	let clock: FakeClock;
	let publisher: RecordingEventPublisher;
	let useCase: AddProjectLocationUseCase;

	beforeEach(() => {
		repo = new InMemoryProjectRepository();
		clock = new FakeClock('2026-05-05T12:00:00Z');
		publisher = new RecordingEventPublisher();
		useCase = new AddProjectLocationUseCase(repo, clock, publisher);
	});

	it('persists the new location and publishes ProjectLocationAdded', async () => {
		const project = buildProject();
		project.pullEvents();
		await repo.save(project);

		await useCase.execute({ projectId: PROJECT_ID, country: 'US', language: 'en' });

		const persisted = await repo.findById(PROJECT_ID);
		const localeStrings = persisted?.locations.map((l) => `${l.country}-${l.language}`);
		expect(localeStrings).toContain('US-en');
		expect(publisher.publishedTypes()).toContain('project-management.LocationAdded');
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: 'missing', country: 'US', language: 'en' }),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(publisher.published()).toHaveLength(0);
	});

	it('preserves the existing locations when adding a new one', async () => {
		const project = buildProject();
		project.pullEvents();
		await repo.save(project);

		await useCase.execute({ projectId: PROJECT_ID, country: 'US', language: 'en' });

		const persisted = await repo.findById(PROJECT_ID);
		expect(persisted?.locations).toHaveLength(2);
	});
});
