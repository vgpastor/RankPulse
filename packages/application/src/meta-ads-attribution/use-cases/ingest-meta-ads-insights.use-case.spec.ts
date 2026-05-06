import type { IdentityAccess, MetaAdsAttribution, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestMetaAdsInsightsUseCase } from './ingest-meta-ads-insights.use-case.js';
import { LinkMetaAdAccountUseCase } from './link-meta-ad-account.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

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

class InMemoryInsightDailyRepo implements MetaAdsAttribution.MetaAdsInsightDailyRepository {
	readonly store = new Map<string, MetaAdsAttribution.MetaAdsInsightDaily>();
	async saveAll(rows: readonly MetaAdsAttribution.MetaAdsInsightDaily[]): Promise<{ inserted: number }> {
		let inserted = 0;
		for (const r of rows) {
			const k = `${r.metaAdAccountId}|${r.observedDate}|${r.metrics.level}|${r.metrics.entityId}`;
			if (this.store.has(k)) continue;
			this.store.set(k, r);
			inserted += 1;
		}
		return { inserted };
	}
	async listForAccount(): Promise<readonly MetaAdsAttribution.MetaAdsInsightDaily[]> {
		return [...this.store.values()];
	}
}

describe('IngestMetaAdsInsightsUseCase', () => {
	let accountRepo: InMemoryAccountRepo;
	let insightRepo: InMemoryInsightDailyRepo;
	let events: RecordingEventPublisher;
	let accountId: string;

	beforeEach(async () => {
		accountRepo = new InMemoryAccountRepo();
		insightRepo = new InMemoryInsightDailyRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkMetaAdAccountUseCase(
			accountRepo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['ma-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			adAccountHandle: 'act_999',
		});
		accountId = result.metaAdAccountId;
		events.clear();
	});

	const buildUseCase = () =>
		new IngestMetaAdsInsightsUseCase(accountRepo, insightRepo, events, new FakeClock('2026-05-04T11:00:00Z'));

	const baseRow = (
		overrides: Partial<{
			observedDate: string;
			level: MetaAdsAttribution.AdsInsightLevel;
			entityId: string;
			impressions: number;
			clicks: number;
			spend: number;
			conversions: number;
		}> = {},
	) => ({
		observedDate: overrides.observedDate ?? '2026-05-01',
		level: overrides.level ?? ('campaign' as MetaAdsAttribution.AdsInsightLevel),
		entityId: overrides.entityId ?? 'c-1',
		entityName: 'Spring Sale',
		impressions: overrides.impressions ?? 10000,
		clicks: overrides.clicks ?? 250,
		spend: overrides.spend ?? 45.67,
		conversions: overrides.conversions ?? 8,
	});

	it('persists rows and publishes batch totals on first ingest', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute({
			metaAdAccountId: accountId,
			rawPayloadId: null,
			rows: [
				baseRow(),
				baseRow({ entityId: 'c-2', impressions: 5000, clicks: 100, spend: 12, conversions: 3 }),
			],
		});
		expect(result.ingested).toBe(2);
		const summary = events.published()[0] as MetaAdsAttribution.MetaAdsInsightsBatchIngested;
		expect(summary.type).toBe('MetaAdsInsightsBatchIngested');
		expect(summary.totalImpressions).toBe(15000);
		expect(summary.totalClicks).toBe(350);
		expect(summary.totalSpend).toBeCloseTo(57.67, 2);
		expect(summary.totalConversions).toBe(11);
	});

	it('treats (account, day, level, entity_id) as the natural key — same row twice = idempotent', async () => {
		const useCase = buildUseCase();
		await useCase.execute({ metaAdAccountId: accountId, rawPayloadId: null, rows: [baseRow()] });
		events.clear();
		const second = await useCase.execute({
			metaAdAccountId: accountId,
			rawPayloadId: null,
			rows: [baseRow()],
		});
		expect(second.ingested).toBe(0);
		expect(insightRepo.store.size).toBe(1);
	});

	it('writes separate rows for different levels of the same entity_id', async () => {
		const useCase = buildUseCase();
		await useCase.execute({
			metaAdAccountId: accountId,
			rawPayloadId: null,
			rows: [baseRow({ level: 'campaign', entityId: '111' }), baseRow({ level: 'adset', entityId: '111' })],
		});
		expect(insightRepo.store.size).toBe(2);
	});

	it('throws NotFoundError when the ad account does not exist', async () => {
		const useCase = buildUseCase();
		await expect(
			useCase.execute({ metaAdAccountId: 'missing', rawPayloadId: null, rows: [baseRow()] }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('returns 0 on an empty batch and does not publish', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute({
			metaAdAccountId: accountId,
			rawPayloadId: null,
			rows: [],
		});
		expect(result.ingested).toBe(0);
		expect(events.published()).toEqual([]);
	});
});
