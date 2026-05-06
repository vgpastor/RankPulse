import { MetaAdsAttribution, type ProjectManagement } from '@rankpulse/domain';
import { and, between, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { metaAdsInsightsDaily } from '../../schema/index.js';

const isAdsInsightLevel = (raw: string): raw is MetaAdsAttribution.AdsInsightLevel =>
	raw === 'account' || raw === 'campaign' || raw === 'adset' || raw === 'ad';

export class DrizzleMetaAdsInsightDailyRepository
	implements MetaAdsAttribution.MetaAdsInsightDailyRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async saveAll(rows: readonly MetaAdsAttribution.MetaAdsInsightDaily[]): Promise<{ inserted: number }> {
		if (rows.length === 0) return { inserted: 0 };
		const values = rows.map((r) => ({
			metaAdAccountId: r.metaAdAccountId,
			projectId: r.projectId,
			observedDate: r.observedDate,
			level: r.metrics.level,
			entityId: r.metrics.entityId,
			entityName: r.metrics.entityName,
			impressions: r.metrics.impressions,
			clicks: r.metrics.clicks,
			spend: r.metrics.spend,
			conversions: r.metrics.conversions,
			rawPayloadId: r.rawPayloadId,
		}));
		const inserted = await this.db
			.insert(metaAdsInsightsDaily)
			.values(values)
			.onConflictDoNothing({
				target: [
					metaAdsInsightsDaily.metaAdAccountId,
					metaAdsInsightsDaily.observedDate,
					metaAdsInsightsDaily.level,
					metaAdsInsightsDaily.entityId,
				],
			})
			.returning({ metaAdAccountId: metaAdsInsightsDaily.metaAdAccountId });
		return { inserted: inserted.length };
	}

	async listForAccount(
		accountId: MetaAdsAttribution.MetaAdAccountId,
		query: MetaAdsAttribution.MetaAdsInsightDailyQuery,
	): Promise<readonly MetaAdsAttribution.MetaAdsInsightDaily[]> {
		const rows = await this.db
			.select()
			.from(metaAdsInsightsDaily)
			.where(
				and(
					eq(metaAdsInsightsDaily.metaAdAccountId, accountId),
					between(metaAdsInsightsDaily.observedDate, query.from, query.to),
				),
			)
			.orderBy(metaAdsInsightsDaily.observedDate, metaAdsInsightsDaily.entityId);
		return rows.map((r) => {
			// All writers go through the VO, which validates `level` against
			// the canonical enum. A non-canonical value here means manual
			// data corruption — fail loudly so the operator notices instead
			// of silently flattening the row to 'campaign'.
			if (!isAdsInsightLevel(r.level)) {
				throw new Error(
					`meta_ads_insights_daily row has invalid level "${r.level}" for entity ${r.entityId} on ${r.observedDate}; expected one of account|campaign|adset|ad`,
				);
			}
			return MetaAdsAttribution.MetaAdsInsightDaily.rehydrate({
				metaAdAccountId: r.metaAdAccountId as MetaAdsAttribution.MetaAdAccountId,
				projectId: r.projectId as ProjectManagement.ProjectId,
				observedDate: r.observedDate,
				metrics: MetaAdsAttribution.MetaAdsInsightMetrics.create({
					level: r.level,
					entityId: r.entityId,
					entityName: r.entityName,
					impressions: r.impressions,
					clicks: r.clicks,
					spend: r.spend,
					conversions: r.conversions,
				}),
				rawPayloadId: r.rawPayloadId,
			});
		});
	}
}
