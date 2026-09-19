import { ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, InvalidInputError, NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RecordProjectAuthorityProfileUseCase } from './record-project-authority-profile.use-case.js';

const ORG_ID = '99999999-9999-9999-9999-999999999999' as Uuid;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const OBS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd' as Uuid;

class FakeAuthorityRepo implements ProjectManagement.DomainAuthorityObservationRepository {
	saved: ProjectManagement.DomainAuthorityObservation[] = [];
	async save(o: ProjectManagement.DomainAuthorityObservation): Promise<void> {
		this.saved.push(o);
	}
	async listForProject(): Promise<readonly ProjectManagement.DomainAuthorityObservation[]> {
		return [...this.saved].reverse();
	}
}

const summary = {
	totalBacklinks: 0,
	referringDomains: 0,
	referringMainDomains: 0,
	referringPages: 0,
	brokenBacklinks: 0,
	spamScore: null,
	rank: null,
};

describe('RecordProjectAuthorityProfileUseCase', () => {
	let projects: InMemoryProjectRepository;
	let authority: FakeAuthorityRepo;
	let useCase: RecordProjectAuthorityProfileUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		authority = new FakeAuthorityRepo();
		useCase = new RecordProjectAuthorityProfileUseCase(
			projects,
			authority,
			new FakeClock(new Date('2026-09-19T10:00:00Z')),
			new FixedIdGenerator([OBS_ID]),
		);
		await projects.save(
			ProjectManagement.Project.create({
				id: PROJECT_ID,
				organizationId: ORG_ID as never,
				portfolioId: null,
				name: 'Rondas offline',
				primaryDomain: ProjectManagement.DomainName.create('rondasoffline.com'),
				now: new Date('2026-04-15T10:00:00Z'),
			}),
		);
	});

	// A satellite with no referring domains is exactly the case this exists to
	// surface; zeros are a reading, not a missing one.
	it('records the reading under the project and its own domain', async () => {
		const { observationId } = await useCase.execute({
			projectId: PROJECT_ID,
			domain: 'rondasoffline.com',
			rawPayloadId: null,
			summary,
		});
		expect(observationId).toBe(OBS_ID);
		expect(authority.saved).toHaveLength(1);
		expect(authority.saved[0]?.domain).toBe('rondasoffline.com');
		expect(authority.saved[0]?.metrics.referringDomains).toBe(0);
	});

	it('records a secondary domain under the same project', async () => {
		const project = await projects.findById(PROJECT_ID);
		project?.addDomain(ProjectManagement.DomainName.create('softwarerondas.com'), 'main', new Date());
		if (project) await projects.save(project);
		await useCase.execute({
			projectId: PROJECT_ID,
			domain: 'softwarerondas.com',
			rawPayloadId: 'rp-1',
			summary,
		});
		expect(authority.saved[0]?.domain).toBe('softwarerondas.com');
		expect(authority.saved[0]?.rawPayloadId).toBe('rp-1');
	});

	// A schedule pointed at a domain the project does not own must not be
	// filed as the project's authority.
	it('refuses a domain that does not belong to the project', async () => {
		await expect(
			useCase.execute({ projectId: PROJECT_ID, domain: 'tracktik.com', rawPayloadId: null, summary }),
		).rejects.toBeInstanceOf(InvalidInputError);
	});

	it('refuses an unknown project', async () => {
		await expect(
			useCase.execute({
				projectId: '22222222-2222-2222-2222-222222222222',
				domain: 'rondasoffline.com',
				rawPayloadId: null,
				summary,
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
