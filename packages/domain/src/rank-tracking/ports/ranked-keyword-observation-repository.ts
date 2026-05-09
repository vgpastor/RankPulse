import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { RankedKeywordObservation } from '../entities/ranked-keyword-observation.js';

export interface ListRankedKeywordsOptions {
	limit?: number;
	minVolume?: number;
}

export interface MonthlyVolumeBucket {
	/** ISO month, `YYYY-MM-01T00:00:00.000Z` (start of UTC month). */
	readonly month: Date;
	readonly totalVolume: number;
	readonly distinctKeywords: number;
}

export interface AggregateMonthlyVolumeOptions {
	readonly months: number;
	readonly targetDomain?: string;
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

	/**
	 * Aggregates one bucket per UTC month for the trailing `months` window.
	 * For each month, picks the LATEST snapshot per (target_domain, keyword)
	 * pair and sums their `searchVolume`, returning total demand for the
	 * project's tracked-keyword universe over time. When `targetDomain` is
	 * provided the aggregation is scoped to that domain only.
	 *
	 * Used by the Decision Cockpit's Search Demand Trend widget to plot
	 * demand-side trajectory of a project's category (issue #117 Sprint 4).
	 */
	aggregateMonthlyVolumeForProject(
		projectId: ProjectId,
		opts: AggregateMonthlyVolumeOptions,
	): Promise<readonly MonthlyVolumeBucket[]>;
}
