import type { IdentityAccess, MetaAdsAttribution, ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LinkMetaAdAccountUseCase } from './link-meta-ad-account.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryAccountRepo implements MetaAdsAttribution.MetaAdAccountRepository {
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
		adAccountHandle: string,
	): Promise<MetaAdsAttribution.MetaAdAccount | null> {
		// Mirror the production canonicalisation: incoming `act_<digits>` is
		// stored bare, so the lookup key uses the bare form too.
		const stripped = adAccountHandle.startsWith('act_') ? adAccountHandle.slice(4) : adAccountHandle;
		return this.byHandle.get(`${projectId}|${stripped}`) ?? null;
	}
	async listForProject(): Promise<readonly MetaAdsAttribution.MetaAdAccount[]> {
		return [...this.store.values()];
	}
	async listForOrganization(): Promise<readonly MetaAdsAttribution.MetaAdAccount[]> {
		return [...this.store.values()];
	}
}

describe('LinkMetaAdAccountUseCase', () => {
	let repo: InMemoryAccountRepo;
	let events: RecordingEventPublisher;
	const buildUseCase = (ids: Uuid[]) =>
		new LinkMetaAdAccountUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(ids),
			events,
		);

	beforeEach(() => {
		repo = new InMemoryAccountRepo();
		events = new RecordingEventPublisher();
	});

	it('canonicalises an "act_<digits>" handle to the bare numeric form before save', async () => {
		const useCase = buildUseCase(['ma-1' as Uuid]);
		const result = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			adAccountHandle: 'act_123456789',
		});
		const stored = repo.store.get(result.metaAdAccountId);
		expect(stored?.handle.value).toBe('123456789');
	});

	it('publishes MetaAdAccountLinked on first link', async () => {
		const useCase = buildUseCase(['ma-1' as Uuid]);
		await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			adAccountHandle: '999',
		});
		expect(events.publishedTypes()).toContain('MetaAdAccountLinked');
	});

	it('rejects re-linking an already-active account to the same project', async () => {
		const useCase = buildUseCase(['ma-1' as Uuid, 'ma-2' as Uuid]);
		await useCase.execute({ organizationId: ORG_ID, projectId: PROJECT_ID, adAccountHandle: 'act_999' });
		await expect(
			useCase.execute({ organizationId: ORG_ID, projectId: PROJECT_ID, adAccountHandle: 'act_999' }),
		).rejects.toBeInstanceOf(ConflictError);
	});

	it('rejects a non-numeric handle', async () => {
		const useCase = buildUseCase(['ma-1' as Uuid]);
		await expect(
			useCase.execute({ organizationId: ORG_ID, projectId: PROJECT_ID, adAccountHandle: 'act_abc' }),
		).rejects.toThrow();
	});
});
