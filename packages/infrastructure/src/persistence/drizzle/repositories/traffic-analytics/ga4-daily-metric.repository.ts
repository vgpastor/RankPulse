import { type ProjectManagement, TrafficAnalytics } from '@rankpulse/domain';
import { and, between, desc, eq, gte, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { ga4DailyMetrics } from '../../schema/index.js';

export class DrizzleGa4DailyMetricRepository implements TrafficAnalytics.Ga4DailyMetricRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async saveAll(metrics: readonly TrafficAnalytics.Ga4DailyMetric[]): Promise<{ inserted: number }> {
		if (metrics.length === 0) return { inserted: 0 };
		const rows = metrics.map((m) => ({
			ga4PropertyId: m.ga4PropertyId,
			projectId: m.projectId,
			observedDate: m.observedDate,
			dimensionsHash: m.dimensionsHash,
			dimensions: { ...m.body.dimensions },
			metrics: { ...m.body.metrics },
			rawPayloadId: m.rawPayloadId,
		}));
		const inserted = await this.db
			.insert(ga4DailyMetrics)
			.values(rows)
			.onConflictDoNothing({
				target: [ga4DailyMetrics.ga4PropertyId, ga4DailyMetrics.observedDate, ga4DailyMetrics.dimensionsHash],
			})
			.returning({ ga4PropertyId: ga4DailyMetrics.ga4PropertyId });
		return { inserted: inserted.length };
	}

	async listForProperty(
		propertyId: TrafficAnalytics.Ga4PropertyId,
		query: TrafficAnalytics.Ga4DailyMetricQuery,
	): Promise<readonly TrafficAnalytics.Ga4DailyMetric[]> {
		const rows = await this.db
			.select()
			.from(ga4DailyMetrics)
			.where(
				and(
					eq(ga4DailyMetrics.ga4PropertyId, propertyId),
					between(ga4DailyMetrics.observedDate, query.from, query.to),
				),
			)
			.orderBy(ga4DailyMetrics.observedDate);
		return rows.map((r) => this.toAggregate(r));
	}

	async listLatestForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly TrafficAnalytics.Ga4DailyMetric[]> {
		// Mirror the GSC pattern: recent window, capped, ordered by date desc.
		const cutoff = sql<string>`to_char(now() - interval '14 days', 'YYYY-MM-DD')`;
		const rows = await this.db
			.select()
			.from(ga4DailyMetrics)
			.where(and(eq(ga4DailyMetrics.projectId, projectId), gte(ga4DailyMetrics.observedDate, cutoff)))
			.orderBy(desc(ga4DailyMetrics.observedDate))
			.limit(500);
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof ga4DailyMetrics.$inferSelect): TrafficAnalytics.Ga4DailyMetric {
		// The natural key (propertyId, observedDate, dimensionsHash) drives uniqueness;
		// we surface a synthetic surrogate id so the aggregate shape stays stable.
		const surrogateId =
			`${row.ga4PropertyId}#${row.observedDate}#${row.dimensionsHash}` as TrafficAnalytics.Ga4DailyMetricId;
		return TrafficAnalytics.Ga4DailyMetric.rehydrate({
			id: surrogateId,
			ga4PropertyId: row.ga4PropertyId as TrafficAnalytics.Ga4PropertyId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			observedDate: row.observedDate,
			dimensionsHash: row.dimensionsHash,
			body: TrafficAnalytics.Ga4DailyDimensionsMetrics.create({
				dimensions: row.dimensions,
				metrics: row.metrics,
			}),
			rawPayloadId: row.rawPayloadId,
		});
	}
}
