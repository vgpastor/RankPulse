import { type ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { and, between, desc, eq, gte, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { gscObservations } from '../../schema/index.js';

export class DrizzleGscPerformanceObservationRepository
	implements SearchConsoleInsights.GscPerformanceObservationRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async saveAll(
		observations: readonly SearchConsoleInsights.GscPerformanceObservation[],
	): Promise<{ inserted: number }> {
		if (observations.length === 0) return { inserted: 0 };
		// Domain models the absence of a dimension as `null`; the table
		// stores `''` so the natural-key PK can cover every row without
		// COALESCE indexes. Bridge between the two here.
		const inserted = await this.db
			.insert(gscObservations)
			.values(
				observations.map((o) => ({
					observedAt: o.observedAt,
					gscPropertyId: o.gscPropertyId,
					projectId: o.projectId,
					query: o.query ?? '',
					page: o.page ?? '',
					country: o.country ?? '',
					device: o.device ?? '',
					clicks: o.metrics.clicks,
					impressions: o.metrics.impressions,
					ctr: o.metrics.ctr,
					position: o.metrics.position,
					rawPayloadId: o.rawPayloadId,
				})),
			)
			.onConflictDoNothing({
				target: [
					gscObservations.observedAt,
					gscObservations.gscPropertyId,
					gscObservations.query,
					gscObservations.page,
					gscObservations.country,
					gscObservations.device,
				],
			})
			.returning({ id: gscObservations.observedAt });
		return { inserted: inserted.length };
	}

	async listForProperty(
		propertyId: SearchConsoleInsights.GscPropertyId,
		query: SearchConsoleInsights.GscObservationQuery,
	): Promise<readonly SearchConsoleInsights.GscPerformanceObservation[]> {
		const conditions = [
			eq(gscObservations.gscPropertyId, propertyId),
			between(gscObservations.observedAt, query.from, query.to),
		];
		// `undefined`/`null` = "no filter on this dimension"; `''` (explicit
		// empty string) = "filter for rows where this dimension was absent
		// in the GSC API response" (storage uses `''` instead of NULL so
		// the natural-key PK can cover every row without COALESCE indexes).
		if (query.query != null) conditions.push(eq(gscObservations.query, query.query));
		if (query.page != null) conditions.push(eq(gscObservations.page, query.page));
		if (query.country != null) conditions.push(eq(gscObservations.country, query.country));
		if (query.device != null) conditions.push(eq(gscObservations.device, query.device));

		const rows = await this.db
			.select()
			.from(gscObservations)
			.where(and(...conditions))
			.orderBy(gscObservations.observedAt);
		return rows.map((r) => this.toAggregate(r));
	}

	async listLatestForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly SearchConsoleInsights.GscPerformanceObservation[]> {
		const since = sql<Date>`now() - interval '14 days'`;
		const rows = await this.db
			.select()
			.from(gscObservations)
			.where(and(eq(gscObservations.projectId, projectId), gte(gscObservations.observedAt, since)))
			.orderBy(desc(gscObservations.observedAt))
			.limit(500);
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(
		row: typeof gscObservations.$inferSelect,
	): SearchConsoleInsights.GscPerformanceObservation {
		return SearchConsoleInsights.GscPerformanceObservation.rehydrate({
			id: `${row.observedAt.toISOString()}#${row.gscPropertyId}#${row.query}#${row.page}` as SearchConsoleInsights.GscObservationId,
			gscPropertyId: row.gscPropertyId as SearchConsoleInsights.GscPropertyId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			observedAt: row.observedAt,
			// Empty strings in storage = absent dimension in the domain.
			query: row.query === '' ? null : row.query,
			page: row.page === '' ? null : row.page,
			country: row.country === '' ? null : row.country,
			device: row.device === '' ? null : row.device,
			metrics: SearchConsoleInsights.PerformanceMetrics.create({
				clicks: row.clicks,
				impressions: row.impressions,
				ctr: row.ctr,
				position: row.position,
			}),
			rawPayloadId: row.rawPayloadId,
		});
	}
}
