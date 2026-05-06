import { MetaAdsAttribution, type SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface MetaAdsInsightInput {
	observedDate: string; // YYYY-MM-DD
	level: MetaAdsAttribution.AdsInsightLevel;
	entityId: string;
	entityName: string;
	impressions: number;
	clicks: number;
	spend: number;
	conversions: number;
}

export interface IngestMetaAdsInsightsCommand {
	metaAdAccountId: string;
	rows: readonly MetaAdsInsightInput[];
	rawPayloadId: string | null;
}

export interface IngestMetaAdsInsightsResult {
	ingested: number;
}

/**
 * Persists a batch of daily ads-insights rows. Same idempotency contract
 * as the pixel events ingest: the PK is `(meta_ad_account_id,
 * observed_date, level, entity_id)` and the repo uses
 * `onConflictDoNothing`.
 */
export class IngestMetaAdsInsightsUseCase {
	constructor(
		private readonly accounts: MetaAdsAttribution.MetaAdAccountRepository,
		private readonly insights: MetaAdsAttribution.MetaAdsInsightDailyRepository,
		private readonly publisher: SharedKernel.EventPublisher,
		private readonly clock: Clock,
	) {}

	async execute(cmd: IngestMetaAdsInsightsCommand): Promise<IngestMetaAdsInsightsResult> {
		if (cmd.rows.length === 0) return { ingested: 0 };

		const account = await this.accounts.findById(cmd.metaAdAccountId as MetaAdsAttribution.MetaAdAccountId);
		if (!account) throw new NotFoundError(`MetaAdAccount ${cmd.metaAdAccountId} not found`);
		if (!account.isActive()) return { ingested: 0 };

		const aggregates = cmd.rows.map((row) =>
			MetaAdsAttribution.MetaAdsInsightDaily.record({
				metaAdAccountId: account.id,
				projectId: account.projectId,
				observedDate: row.observedDate,
				metrics: MetaAdsAttribution.MetaAdsInsightMetrics.create({
					level: row.level,
					entityId: row.entityId,
					entityName: row.entityName,
					impressions: row.impressions,
					clicks: row.clicks,
					spend: row.spend,
					conversions: row.conversions,
				}),
				rawPayloadId: cmd.rawPayloadId,
			}),
		);

		const { inserted } = await this.insights.saveAll(aggregates);

		const totals = cmd.rows.reduce(
			(acc, row) => ({
				impressions: acc.impressions + row.impressions,
				clicks: acc.clicks + row.clicks,
				spend: acc.spend + row.spend,
				conversions: acc.conversions + row.conversions,
			}),
			{ impressions: 0, clicks: 0, spend: 0, conversions: 0 },
		);

		await this.publisher.publish([
			new MetaAdsAttribution.MetaAdsInsightsBatchIngested({
				projectId: account.projectId,
				metaAdAccountId: account.id,
				rowsCount: inserted,
				totalImpressions: totals.impressions,
				totalClicks: totals.clicks,
				totalSpend: totals.spend,
				totalConversions: totals.conversions,
				occurredAt: this.clock.now(),
			}),
		]);

		return { ingested: inserted };
	}
}
