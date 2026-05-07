import type { ExperienceAnalytics, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkClarityProjectUseCase } from './link-clarity-project.use-case.js';
import { UnlinkClarityProjectUseCase } from './unlink-clarity-project.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryClarityProjectRepo implements ExperienceAnalytics.ClarityProjectRepository {
	readonly store = new Map<string, ExperienceAnalytics.ClarityProject>();
	readonly byHandle = new Map<string, ExperienceAnalytics.ClarityProject>();
	async save(p: ExperienceAnalytics.ClarityProject): Promise<void> {
		this.store.set(p.id, p);
		this.byHandle.set(`${p.projectId}|${p.clarityHandle.value}`, p);
	}
	async findById(
		id: ExperienceAnalytics.ClarityProjectId,
	): Promise<ExperienceAnalytics.ClarityProject | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndHandle(
		projectId: ProjectManagement.ProjectId,
		clarityHandle: string,
	): Promise<ExperienceAnalytics.ClarityProject | null> {
		return this.byHandle.get(`${projectId}|${clarityHandle}`) ?? null;
	}
	async listForProject(): Promise<readonly ExperienceAnalytics.ClarityProject[]> {
		return [...this.store.values()];
	}
	async listForOrganization(): Promise<readonly ExperienceAnalytics.ClarityProject[]> {
		return [...this.store.values()];
	}
}

describe('UnlinkClarityProjectUseCase', () => {
	let repo: InMemoryClarityProjectRepo;
	let events: RecordingEventPublisher;
	let clarityProjectId: string;

	beforeEach(async () => {
		repo = new InMemoryClarityProjectRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkClarityProjectUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['cp-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			clarityHandle: 'abcd1234ef',
		});
		clarityProjectId = result.clarityProjectId;
		events.clear();
	});

	it('marks the project as unlinked and persists it', async () => {
		const useCase = new UnlinkClarityProjectUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));

		await useCase.execute({ clarityProjectId });

		const stored = await repo.findById(clarityProjectId as ExperienceAnalytics.ClarityProjectId);
		expect(stored?.isActive()).toBe(false);
		expect(stored?.unlinkedAt).toEqual(new Date('2026-05-05T11:00:00Z'));
	});

	it('is idempotent — second unlink is a no-op', async () => {
		const first = new UnlinkClarityProjectUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await first.execute({ clarityProjectId });
		const firstUnlinkedAt = (await repo.findById(clarityProjectId as ExperienceAnalytics.ClarityProjectId))
			?.unlinkedAt;

		const second = new UnlinkClarityProjectUseCase(repo, new FakeClock('2026-05-06T11:00:00Z'));
		await expect(second.execute({ clarityProjectId })).resolves.toBeUndefined();

		const stored = await repo.findById(clarityProjectId as ExperienceAnalytics.ClarityProjectId);
		expect(stored?.unlinkedAt).toEqual(firstUnlinkedAt);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		const useCase = new UnlinkClarityProjectUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await expect(useCase.execute({ clarityProjectId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
	});
});
