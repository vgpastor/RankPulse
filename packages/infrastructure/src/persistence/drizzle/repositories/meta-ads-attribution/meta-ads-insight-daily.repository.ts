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
			// Defensive: a row written by an older worker version with a
			// non-canonical level string would explode the VO. We coerce
			// unknown to 'campaign' (the most common default) so the read
			// path stays robust; a follow-up data fix is preferable.
			const level: MetaAdsAttribution.AdsInsightLevel = isAdsInsightLevel(r.level) ? r.level : 'campaign';
			return MetaAdsAttribution.MetaAdsInsightDaily.rehydrate({
				metaAdAccountId: r.metaAdAccountId as MetaAdsAttribution.MetaAdAccountId,
				projectId: r.projectId as ProjectManagement.ProjectId,
				observedDate: r.observedDate,
				metrics: MetaAdsAttribution.MetaAdsInsightMetrics.create({
					level,
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
