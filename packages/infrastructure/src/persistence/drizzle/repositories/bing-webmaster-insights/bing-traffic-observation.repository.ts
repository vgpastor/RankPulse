import { BingWebmasterInsights, type ProjectManagement } from '@rankpulse/domain';
import { and, between, desc, eq, gte, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { bingTrafficObservations } from '../../schema/index.js';

export class DrizzleBingTrafficObservationRepository
	implements BingWebmasterInsights.BingTrafficObservationRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async saveAll(
		observations: readonly BingWebmasterInsights.BingTrafficObservation[],
	): Promise<{ inserted: number }> {
		if (observations.length === 0) return { inserted: 0 };
		const inserted = await this.db
			.insert(bingTrafficObservations)
			.values(
				observations.map((o) => ({
					bingPropertyId: o.bingPropertyId,
					projectId: o.projectId,
					observedDate: o.observedDate,
					clicks: o.metrics.clicks,
					impressions: o.metrics.impressions,
					avgClickPosition: o.metrics.avgClickPosition,
					avgImpressionPosition: o.metrics.avgImpressionPosition,
					rawPayloadId: o.rawPayloadId,
				})),
			)
			.onConflictDoNothing({
				target: [bingTrafficObservations.bingPropertyId, bingTrafficObservations.observedDate],
			})
			.returning({ bingPropertyId: bingTrafficObservations.bingPropertyId });
		return { inserted: inserted.length };
	}

	async listForProperty(
		propertyId: BingWebmasterInsights.BingPropertyId,
		query: BingWebmasterInsights.BingTrafficObservationQuery,
	): Promise<readonly BingWebmasterInsights.BingTrafficObservation[]> {
		const rows = await this.db
			.select()
			.from(bingTrafficObservations)
			.where(
				and(
					eq(bingTrafficObservations.bingPropertyId, propertyId),
					between(bingTrafficObservations.observedDate, query.from, query.to),
				),
			)
			.orderBy(bingTrafficObservations.observedDate);
		return rows.map((r) => this.toAggregate(r));
	}

	async listLatestForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly BingWebmasterInsights.BingTrafficObservation[]> {
		const cutoff = sql<string>`to_char(now() - interval '14 days', 'YYYY-MM-DD')`;
		const rows = await this.db
			.select()
			.from(bingTrafficObservations)
			.where(
				and(
					eq(bingTrafficObservations.projectId, projectId),
					gte(bingTrafficObservations.observedDate, cutoff),
				),
			)
			.orderBy(desc(bingTrafficObservations.observedDate))
			.limit(500);
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(
		row: typeof bingTrafficObservations.$inferSelect,
	): BingWebmasterInsights.BingTrafficObservation {
		return BingWebmasterInsights.BingTrafficObservation.rehydrate({
			bingPropertyId: row.bingPropertyId as BingWebmasterInsights.BingPropertyId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			observedDate: row.observedDate,
			metrics: BingWebmasterInsights.BingTrafficMetrics.create({
				clicks: row.clicks,
				impressions: row.impressions,
				avgClickPosition: row.avgClickPosition,
				avgImpressionPosition: row.avgImpressionPosition,
			}),
			rawPayloadId: row.rawPayloadId,
		});
	}
}
