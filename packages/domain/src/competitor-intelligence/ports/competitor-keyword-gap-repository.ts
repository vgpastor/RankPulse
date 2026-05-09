import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { CompetitorKeywordGap } from '../entities/competitor-keyword-gap.js';

export interface ListCompetitorKeywordGapsOptions {
	limit?: number;
	minVolume?: number;
}

export interface CompetitorKeywordGapRepository {
	/**
	 * Bulk insert with `onConflictDoNothing` against the natural key
	 * `(observed_at, project_id, our_domain, competitor_domain, keyword,
	 * country, language)`. `inserted` reports rows attempted (Drizzle on
	 * postgres-js does not surface affected counts on `onConflictDoNothing`),
	 * matching the `RankedKeywordObservationRepository` convention.
	 */
	saveAll(gaps: readonly CompetitorKeywordGap[]): Promise<{ inserted: number }>;

	/**
	 * Returns the most recent snapshot of keyword gaps between `ourDomain` and
	 * `competitorDomain` within the project, ranked by ROI score
	 * `(volume × cpc) / (kd + 1)` descending (NULLs last). Optionally filtered
	 * by minimum search volume and capped to `limit` rows.
	 */
	listLatestForCompetitor(
		projectId: ProjectId,
		ourDomain: string,
		competitorDomain: string,
		opts?: ListCompetitorKeywordGapsOptions,
	): Promise<readonly CompetitorKeywordGap[]>;
}
