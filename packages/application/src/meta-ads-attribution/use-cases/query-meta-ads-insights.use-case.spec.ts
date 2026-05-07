import { type IdentityAccess, MetaAdsAttribution, type ProjectManagement } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryMetaAdsInsightsUseCase } from './query-meta-ads-insights.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const ACCOUNT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as MetaAdsAttribution.MetaAdAccountId;
const OTHER_ACCOUNT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab' as Uuid as MetaAdsAttribution.MetaAdAccountId;

class InMemoryAccountRepo implements MetaAdsAttribution.MetaAdAccountRepository {
	readonly store = new Map<string, MetaAdsAttribution.MetaAdAccount>();
	async save(a: MetaAdsAttribution.MetaAdAccount): Promise<void> {
		this.store.set(a.id, a);
	}
	async findById(id: MetaAdsAttribution.MetaAdAccountId): Promise<MetaAdsAttribution.MetaAdAccount | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndHandle(): Promise<MetaAdsAttribution.MetaAdAccount | null> {
		return null;
	}
	async listForProject(): Promise<readonly MetaAdsAttribution.MetaAdAccount[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly MetaAdsAttribution.MetaAdAccount[]> {
		return [];
	}
}

class InMemoryInsightsRepo implements MetaAdsAttribution.MetaAdsInsightDailyRepository {
	readonly rows: MetaAdsAttribution.MetaAdsInsightDaily[] = [];
	async saveAll(rows: readonly MetaAdsAttribution.MetaAdsInsightDaily[]): Promise<{ inserted: number }> {
		this.rows.push(...rows);
		return { inserted: rows.length };
	}
	async listForAccount(
		accountId: MetaAdsAttribution.MetaAdAccountId,
		query: { from: string; to: string },
	): Promise<readonly MetaAdsAttribution.MetaAdsInsightDaily[]> {
		return this.rows
			.filter((r) => r.metaAdAccountId === accountId)
			.filter((r) => r.observedDate >= query.from && r.observedDate <= query.to)
			.sort((a, b) => a.observedDate.localeCompare(b.observedDate));
	}
}

const buildInsight = (overrides: {
	observedDate: string;
	clicks?: number;
	metaAdAccountId?: MetaAdsAttribution.MetaAdAccountId;
}): MetaAdsAttribution.MetaAdsInsightDaily =>
	MetaAdsAttribution.MetaAdsInsightDaily.record({
		metaAdAccountId: overrides.metaAdAccountId ?? ACCOUNT_ID,
		projectId: PROJECT_ID,
		observedDate: overrides.observedDate,
		metrics: MetaAdsAttribution.MetaAdsInsightMetrics.create({
			level: 'campaign',
			entityId: '1234567890',
			entityName: 'Spring Campaign',
			impressions: 1000,
			clicks: overrides.clicks ?? 50,
			spend: 25.5,
			conversions: 3,
		}),
		rawPayloadId: null,
	});

describe('QueryMetaAdsInsightsUseCase', () => {
	let accountRepo: InMemoryAccountRepo;
	let insightsRepo: InMemoryInsightsRepo;
	let useCase: QueryMetaAdsInsightsUseCase;

	beforeEach(async () => {
		accountRepo = new InMemoryAccountRepo();
		insightsRepo = new InMemoryInsightsRepo();
		useCase = new QueryMetaAdsInsightsUseCase(accountRepo, insightsRepo);
		await accountRepo.save(
			MetaAdsAttribution.MetaAdAccount.link({
				id: ACCOUNT_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				adAccountHandle: 'act_1234567890',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
	});

	it('returns insights in window for the ad account', async () => {
		await insightsRepo.saveAll([
			buildInsight({ observedDate: '2026-05-01', clicks: 50 }),
			buildInsight({ observedDate: '2026-05-02', clicks: 75 }),
		]);

		const result = await useCase.execute({
			metaAdAccountId: ACCOUNT_ID,
			from: '2026-05-01',
			to: '2026-05-02',
		});

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.clicks)).toEqual([50, 75]);
		expect(result[0]?.entityName).toBe('Spring Campaign');
		expect(result[0]?.level).toBe('campaign');
	});

	it('throws NotFoundError when the ad account does not exist', async () => {
		await expect(
			useCase.execute({ metaAdAccountId: 'missing', from: '2026-05-01', to: '2026-05-02' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('honours the date window', async () => {
		await insightsRepo.saveAll([
			buildInsight({ observedDate: '2026-04-30' }),
			buildInsight({ observedDate: '2026-05-15' }),
		]);

		const result = await useCase.execute({
			metaAdAccountId: ACCOUNT_ID,
			from: '2026-05-01',
			to: '2026-05-31',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.observedDate).toBe('2026-05-15');
	});

	it('scopes results to the requested ad account', async () => {
		await accountRepo.save(
			MetaAdsAttribution.MetaAdAccount.link({
				id: OTHER_ACCOUNT_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				adAccountHandle: 'act_9999999999',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
		await insightsRepo.saveAll([
			buildInsight({ observedDate: '2026-05-01', clicks: 50 }),
			buildInsight({
				observedDate: '2026-05-01',
				clicks: 999,
				metaAdAccountId: OTHER_ACCOUNT_ID,
			}),
		]);

		const result = await useCase.execute({
			metaAdAccountId: ACCOUNT_ID,
			from: '2026-05-01',
			to: '2026-05-01',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.clicks).toBe(50);
	});
});
