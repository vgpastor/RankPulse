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
	 * One row per distinct (GSC property, query) pair within the rolling
	 * window, with summed impressions/clicks and impression-weighted average
	 * position. Used by the CTR-Anomaly / Lost-Opportunity / Quick-Win
	 * widgets that all need the same primitive view of "which keywords
	 * matter, how big are they, where do we rank?"
	 *
	 * Aggregation is per-property (not collapsed to the bare query) so a
	 * project with several linked GSC properties doesn't blend domains: a
	 * dominant property (e.g. the main brand site) must not mask the
	 * market-specific siblings, and a query that ranks well on one domain
	 * must not dilute the same query ranking poorly on another. Each row
	 * carries its `siteUrl` so callers can group/section by property.
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

	/**
	 * Project-level daily totals (clicks + impressions) over the trailing
	 * window. One row per UTC day, summed across every dimension (query,
	 * page, country, device, GSC property). Used by the Forecast 90d widget
	 * to fit a Holt-Winters smoother on a single time series at the cockpit
	 * granularity (issue #117 Sprint 4).
	 */
	dailyTotalsForProject(
		projectId: ProjectId,
		windowDays: number,
	): Promise<readonly DailyClicksImpressionsRow[]>;
}

export interface QueryAggregateRow {
	/** The GSC property (site URL) this aggregate belongs to. */
	readonly siteUrl: string;
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

export interface DailyClicksImpressionsRow {
	/** UTC start-of-day for this row. */
	readonly day: Date;
	readonly clicks: number;
	readonly impressions: number;
}
