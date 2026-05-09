import type { ProjectId } from '../../project-management/value-objects/identifiers.js';

/**
 * Server-side aggregations over `gsc_observations` that power the Decision
 * Cockpit widgets. Lives in its own port (not in
 * GscPerformanceObservationRepository) so the write/read surfaces stay
 * separable: the ingest path uses the repository's `saveAll`; the cockpit
 * read models go straight against this port via dedicated SQL.
 *
 * Each method aggregates server-side because the cockpit needs aggregate
 * statistics (sum impressions, avg position) over the rolling window —
 * shipping every row to the Node process and aggregating in JS would
 * scale linearly with the number of GSC daily rows × queries × pages and
 * blow the API timeout for projects with > a few thousand keywords.
 */
export interface GscCockpitReadModel {
	/**
	 * One row per distinct GSC query (search term) within the rolling
	 * window, with summed impressions/clicks and impression-weighted average
	 * position. Used by the CTR-Anomaly / Lost-Opportunity / Quick-Win
	 * widgets that all need the same primitive view of "which keywords
	 * matter, how big are they, where do we rank?"
	 */
	aggregateByQuery(
		projectId: ProjectId,
		windowDays: number,
		options?: { minImpressions?: number; limit?: number },
	): Promise<readonly QueryAggregateRow[]>;

	/**
	 * Total clicks per ISO-week per query within the rolling window. Used by
	 * Brand-vs-No-Brand decay alert: the use case classifies each query as
	 * branded or not, sums weekly, and compares week-over-week.
	 */
	weeklyClicksByQuery(projectId: ProjectId, windowDays: number): Promise<readonly WeeklyClicksByQueryRow[]>;
}

export interface QueryAggregateRow {
	readonly query: string;
	readonly totalImpressions: number;
	readonly totalClicks: number;
	readonly avgPosition: number;
	readonly bestPage: string | null;
}

export interface WeeklyClicksByQueryRow {
	/** First day of the ISO-week (Monday, UTC) for this row. */
	readonly weekStart: Date;
	readonly query: string;
	readonly clicks: number;
	readonly impressions: number;
}
