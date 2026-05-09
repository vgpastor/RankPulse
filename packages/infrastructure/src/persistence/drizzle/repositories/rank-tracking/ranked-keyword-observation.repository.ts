import { type ProjectManagement, RankTracking } from '@rankpulse/domain';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { rankedKeywordsObservations } from '../../schema/index.js';

/**
 * Issue #127: persists snapshots of a target domain's ranked-keyword universe.
 * The natural-key PK on the hypertable absorbs idempotent re-runs at the
 * same `observedAt`; `saveAll` reports `inserted = rows.length` because
 * postgres-js doesn't surface row counts under `onConflictDoNothing` and the
 * caller treats this number as "rows attempted" — same convention as
 * `DrizzleGscPerformanceObservationRepository`.
 */
export class DrizzleRankedKeywordObservationRepository
	implements RankTracking.RankedKeywordObservationRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async saveAll(
		observations: readonly RankTracking.RankedKeywordObservation[],
	): Promise<{ inserted: number }> {
		if (observations.length === 0) return { inserted: 0 };
		await this.db
			.insert(rankedKeywordsObservations)
			.values(
				observations.map((o) => ({
					observedAt: o.observedAt,
					projectId: o.projectId,
					targetDomain: o.targetDomain,
					keyword: o.keyword,
					country: o.country,
					language: o.language,
					position: o.position,
					searchVolume: o.searchVolume,
					keywordDifficulty: o.keywordDifficulty,
					trafficEstimate: o.trafficEstimate,
					cpc: o.cpc,
					rankingUrl: o.rankingUrl,
					sourceProvider: o.sourceProvider,
					rawPayloadId: o.rawPayloadId,
				})),
			)
			.onConflictDoNothing();
		return { inserted: observations.length };
	}

	async listLatestForDomain(
		projectId: ProjectManagement.ProjectId,
		targetDomain: string,
		opts: RankTracking.ListRankedKeywordsOptions = {},
	): Promise<readonly RankTracking.RankedKeywordObservation[]> {
		// Latest snapshot = the rows whose `observed_at` matches the MAX
		// observed_at for this (project, target) pair. Single CTE so we don't
		// need a second round-trip to discover the snapshot timestamp.
		const minVolume = opts.minVolume ?? null;
		const limit = opts.limit ?? 500;
		const rows = await this.db
			.select()
			.from(rankedKeywordsObservations)
			.where(
				and(
					eq(rankedKeywordsObservations.projectId, projectId),
					eq(rankedKeywordsObservations.targetDomain, targetDomain),
					eq(
						rankedKeywordsObservations.observedAt,
						sql<Date>`(
							SELECT MAX(observed_at) FROM ranked_keywords_observations
							WHERE project_id = ${projectId} AND target_domain = ${targetDomain}
						)`,
					),
					minVolume != null ? gte(rankedKeywordsObservations.searchVolume, minVolume) : sql`TRUE`,
				),
			)
			.orderBy(
				desc(sql`COALESCE(${rankedKeywordsObservations.trafficEstimate}, 0)`),
				desc(sql`COALESCE(${rankedKeywordsObservations.searchVolume}, 0)`),
			)
			.limit(limit);

		return rows.map((r) =>
			RankTracking.RankedKeywordObservation.rehydrate({
				id: `${r.observedAt.toISOString()}#${r.projectId}#${r.targetDomain}#${r.keyword}` as RankTracking.RankedKeywordObservationId,
				projectId: r.projectId as ProjectManagement.ProjectId,
				targetDomain: r.targetDomain,
				keyword: r.keyword,
				country: r.country,
				language: r.language,
				position: r.position,
				searchVolume: r.searchVolume,
				keywordDifficulty: r.keywordDifficulty,
				trafficEstimate: r.trafficEstimate,
				cpc: r.cpc,
				rankingUrl: r.rankingUrl,
				sourceProvider: r.sourceProvider,
				rawPayloadId: r.rawPayloadId,
				observedAt: r.observedAt,
			}),
		);
	}

	async aggregateMonthlyVolumeForProject(
		projectId: ProjectManagement.ProjectId,
		opts: RankTracking.AggregateMonthlyVolumeOptions,
	): Promise<readonly RankTracking.MonthlyVolumeBucket[]> {
		// One bucket per month over the trailing `months` window. Inside each
		// bucket we keep only the LATEST snapshot per (target_domain, keyword)
		// — the same keyword can be re-observed mid-month and we don't want to
		// double-count. `DISTINCT ON` does this in a single round-trip.
		//
		// Postgres `date_trunc('month', observed_at)` returns a timestamp at
		// the start of the bucket's UTC month, which matches the domain's
		// `MonthlyVolumeBucket.month` contract.
		const months = opts.months;
		const targetDomain = opts.targetDomain ?? null;
		const result = await this.db.execute(sql<{
			month: Date;
			total_volume: number | null;
			distinct_keywords: number | null;
		}>`
			WITH bucketed AS (
				SELECT DISTINCT ON (date_trunc('month', observed_at), target_domain, keyword)
					date_trunc('month', observed_at) AS month,
					target_domain,
					keyword,
					search_volume
				FROM ranked_keywords_observations
				WHERE project_id = ${projectId}
					AND observed_at >= now() - (${months}::int * interval '1 month')
					${targetDomain ? sql`AND target_domain = ${targetDomain}` : sql``}
				ORDER BY date_trunc('month', observed_at), target_domain, keyword, observed_at DESC
			)
			SELECT
				month,
				COALESCE(SUM(search_volume), 0)::bigint AS total_volume,
				COUNT(DISTINCT keyword)::int AS distinct_keywords
			FROM bucketed
			GROUP BY month
			ORDER BY month ASC
		`);
		type Row = {
			month: Date;
			total_volume: number | string | null;
			distinct_keywords: number | null;
		};
		const rows = ((result as { rows?: unknown[] }).rows ?? (result as unknown[])) as Row[];
		return rows.map((r) => ({
			month: r.month,
			totalVolume: Number(r.total_volume ?? 0),
			distinctKeywords: Number(r.distinct_keywords ?? 0),
		}));
	}
}
