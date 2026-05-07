import type { IdentityAccess, MetaAdsAttribution, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkMetaAdAccountUseCase } from './link-meta-ad-account.use-case.js';
import { UnlinkMetaAdAccountUseCase } from './unlink-meta-ad-account.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryAdAccountRepo implements MetaAdsAttribution.MetaAdAccountRepository {
	readonly store = new Map<string, MetaAdsAttribution.MetaAdAccount>();
	readonly byHandle = new Map<string, MetaAdsAttribution.MetaAdAccount>();
	async save(a: MetaAdsAttribution.MetaAdAccount): Promise<void> {
		this.store.set(a.id, a);
		this.byHandle.set(`${a.projectId}|${a.handle.value}`, a);
	}
	async findById(id: MetaAdsAttribution.MetaAdAccountId): Promise<MetaAdsAttribution.MetaAdAccount | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndHandle(
		projectId: ProjectManagement.ProjectId,
		handle: string,
	): Promise<MetaAdsAttribution.MetaAdAccount | null> {
		const stripped = handle.startsWith('act_') ? handle.slice(4) : handle;
		return this.byHandle.get(`${projectId}|${stripped}`) ?? null;
	}
	async listForProject(): Promise<readonly MetaAdsAttribution.MetaAdAccount[]> {
		return [...this.store.values()];
	}
	async listForOrganization(): Promise<readonly MetaAdsAttribution.MetaAdAccount[]> {
		return [...this.store.values()];
	}
}

describe('UnlinkMetaAdAccountUseCase', () => {
	let repo: InMemoryAdAccountRepo;
	let events: RecordingEventPublisher;
	let metaAdAccountId: string;

	beforeEach(async () => {
		repo = new InMemoryAdAccountRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkMetaAdAccountUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['ma-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			adAccountHandle: '123456789',
		});
		metaAdAccountId = result.metaAdAccountId;
		events.clear();
	});

	it('marks the ad account as unlinked and persists it', async () => {
		const useCase = new UnlinkMetaAdAccountUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));

		await useCase.execute({ metaAdAccountId });

		const stored = await repo.findById(metaAdAccountId as MetaAdsAttribution.MetaAdAccountId);
		expect(stored?.isActive()).toBe(false);
		expect(stored?.unlinkedAt).toEqual(new Date('2026-05-05T11:00:00Z'));
	});

	it('is idempotent — second unlink is a no-op', async () => {
		const first = new UnlinkMetaAdAccountUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await first.execute({ metaAdAccountId });
		const firstUnlinkedAt = (await repo.findById(metaAdAccountId as MetaAdsAttribution.MetaAdAccountId))
			?.unlinkedAt;

		const second = new UnlinkMetaAdAccountUseCase(repo, new FakeClock('2026-05-06T11:00:00Z'));
		await expect(second.execute({ metaAdAccountId })).resolves.toBeUndefined();

		const stored = await repo.findById(metaAdAccountId as MetaAdsAttribution.MetaAdAccountId);
		expect(stored?.unlinkedAt).toEqual(firstUnlinkedAt);
	});

	it('throws NotFoundError when the ad account does not exist', async () => {
		const useCase = new UnlinkMetaAdAccountUseCase(repo, new FakeClock('2026-05-05T11:00:00Z'));
		await expect(useCase.execute({ metaAdAccountId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
	});
});
