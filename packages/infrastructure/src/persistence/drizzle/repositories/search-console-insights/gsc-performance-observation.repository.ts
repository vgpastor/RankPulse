import { type ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { and, between, desc, eq, gte, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { gscObservations } from '../../schema/index.js';

/**
 * Postgres accepts at most 65 535 bind parameters per statement. Each
 * observation binds twelve columns, so a single multi-row INSERT tops out at
 * 5 461 rows — and a busy property's search-analytics window runs well past
 * that (patroltech.online: 5 773 rows, 69 276 parameters, refused since
 * 2026-07-08). One thousand rows a statement keeps a comfortable margin and
 * costs nothing measurable per round-trip.
 */
export const GSC_INSERT_BATCH_ROWS = 1_000;

const chunk = <T>(items: readonly T[], size: number): T[][] => {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
};

export class DrizzleGscPerformanceObservationRepository
	implements SearchConsoleInsights.GscPerformanceObservationRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async saveAll(
		observations: readonly SearchConsoleInsights.GscPerformanceObservation[],
	): Promise<{ inserted: number }> {
		if (observations.length === 0) return { inserted: 0 };
		let inserted = 0;
		for (const batch of chunk(observations, GSC_INSERT_BATCH_ROWS)) {
			inserted += await this.insertBatch(batch);
		}
		return { inserted };
	}

	private async insertBatch(
		observations: readonly SearchConsoleInsights.GscPerformanceObservation[],
	): Promise<number> {
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
		return inserted.length;
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
