import { CompetitorIntelligence, type ProjectManagement } from '@rankpulse/domain';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { competitorKeywordGaps } from '../../schema/index.js';

/**
 * Issue #128: persists competitor keyword gaps and exposes the latest
 * snapshot ranked by ROI score `(searchVolume × cpc) / (keyword_difficulty + 1)`
 * descending. The natural-key PK on the hypertable absorbs idempotent re-runs
 * at the same `observedAt`; `saveAll` reports `inserted = rows.length` because
 * postgres-js doesn't surface row counts under `onConflictDoNothing` — same
 * convention as `DrizzleRankedKeywordObservationRepository`.
 */
export class DrizzleCompetitorKeywordGapRepository
	implements CompetitorIntelligence.CompetitorKeywordGapRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async saveAll(gaps: readonly CompetitorIntelligence.CompetitorKeywordGap[]): Promise<{ inserted: number }> {
		if (gaps.length === 0) return { inserted: 0 };
		await this.db
			.insert(competitorKeywordGaps)
			.values(
				gaps.map((g) => ({
					observedAt: g.observedAt,
					projectId: g.projectId,
					ourDomain: g.ourDomain,
					competitorDomain: g.competitorDomain,
					keyword: g.keyword,
					country: g.country,
					language: g.language,
					ourPosition: g.ourPosition,
					theirPosition: g.theirPosition,
					searchVolume: g.searchVolume,
					cpc: g.cpc,
					keywordDifficulty: g.keywordDifficulty,
					sourceProvider: g.sourceProvider,
					rawPayloadId: g.rawPayloadId,
				})),
			)
			.onConflictDoNothing();
		return { inserted: gaps.length };
	}

	async listLatestForCompetitor(
		projectId: ProjectManagement.ProjectId,
		ourDomain: string,
		competitorDomain: string,
		opts: CompetitorIntelligence.ListCompetitorKeywordGapsOptions = {},
	): Promise<readonly CompetitorIntelligence.CompetitorKeywordGap[]> {
		const minVolume = opts.minVolume ?? null;
		const limit = opts.limit ?? 500;
		// ROI = (volume × cpc) / (kd + 1). Missing volume/CPC → null score, sorted last.
		// COALESCE(kd, 0) keeps the divisor stable when KD is unknown.
		const rows = await this.db
			.select()
			.from(competitorKeywordGaps)
			.where(
				and(
					eq(competitorKeywordGaps.projectId, projectId),
					eq(competitorKeywordGaps.ourDomain, ourDomain),
					eq(competitorKeywordGaps.competitorDomain, competitorDomain),
					eq(
						competitorKeywordGaps.observedAt,
						sql<Date>`(
							SELECT MAX(observed_at) FROM competitor_keyword_gaps
							WHERE project_id = ${projectId}
								AND our_domain = ${ourDomain}
								AND competitor_domain = ${competitorDomain}
						)`,
					),
					minVolume != null ? gte(competitorKeywordGaps.searchVolume, minVolume) : sql`TRUE`,
				),
			)
			.orderBy(
				sql`(${competitorKeywordGaps.searchVolume} * ${competitorKeywordGaps.cpc}) / (COALESCE(${competitorKeywordGaps.keywordDifficulty}, 0) + 1) DESC NULLS LAST`,
				sql`COALESCE(${competitorKeywordGaps.searchVolume}, 0) DESC`,
			)
			.limit(limit);

		return rows.map((r) =>
			CompetitorIntelligence.CompetitorKeywordGap.rehydrate({
				id: `${r.observedAt.toISOString()}#${r.projectId}#${r.ourDomain}#${r.competitorDomain}#${r.keyword}` as CompetitorIntelligence.CompetitorKeywordGapId,
				projectId: r.projectId as ProjectManagement.ProjectId,
				ourDomain: r.ourDomain,
				competitorDomain: r.competitorDomain,
				keyword: r.keyword,
				country: r.country,
				language: r.language,
				ourPosition: r.ourPosition,
				theirPosition: r.theirPosition,
				searchVolume: r.searchVolume,
				cpc: r.cpc,
				keywordDifficulty: r.keywordDifficulty,
				sourceProvider: r.sourceProvider,
				rawPayloadId: r.rawPayloadId,
				observedAt: r.observedAt,
			}),
		);
	}
}
