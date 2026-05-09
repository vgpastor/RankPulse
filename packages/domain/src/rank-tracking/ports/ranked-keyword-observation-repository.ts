import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { RankedKeywordObservation } from '../entities/ranked-keyword-observation.js';

export interface ListRankedKeywordsOptions {
	limit?: number;
	minVolume?: number;
}

export interface RankedKeywordObservationRepository {
	/**
	 * Bulk insert with `onConflictDoNothing` against the natural key
	 * `(observed_at, project_id, target_domain, keyword, country, language)`.
	 * `inserted` is the number of rows that actually landed — re-fetches
	 * within the same `observed_at` collide and are excluded. Reporting raw
	 * input length would inflate ingestion metrics on every retry.
	 */
	saveAll(observations: readonly RankedKeywordObservation[]): Promise<{ inserted: number }>;

	/**
	 * Returns the most recent snapshot of a target domain's ranked keywords
	 * within the project, optionally filtered by minimum search volume and
	 * capped to `limit` rows ordered by descending traffic estimate (or by
	 * search volume if traffic is missing).
	 */
	listLatestForDomain(
		projectId: ProjectId,
		targetDomain: string,
		opts?: ListRankedKeywordsOptions,
	): Promise<readonly RankedKeywordObservation[]>;
}
