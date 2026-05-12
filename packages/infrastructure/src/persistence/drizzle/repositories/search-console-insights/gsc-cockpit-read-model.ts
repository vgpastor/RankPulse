import type { ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';

const unwrap = <T>(rows: unknown): T[] => ((rows as { rows?: unknown[] }).rows ?? (rows as unknown[])) as T[];

export class DrizzleGscCockpitReadModel implements SearchConsoleInsights.GscCockpitReadModel {
	constructor(private readonly db: DrizzleDatabase) {}

	async aggregateByQuery(
		projectId: ProjectManagement.ProjectId,
		windowDays: number,
		options?: { minImpressions?: number; limit?: number },
	): Promise<readonly SearchConsoleInsights.QueryAggregateRow[]> {
		const minImpr = Math.max(0, options?.minImpressions ?? 0);
		const limit = Math.min(Math.max(options?.limit ?? 500, 1), 5000);
		// Impression-weighted average position is the meaningful aggregate —
		// a plain AVG(position) gives every (date,page,country,device) row the
		// same weight, which under-weights high-traffic pages. The bestPage
		// is whichever URL produced the most clicks for the query (tie-break
		// on impressions) — used as the deep-link target in the SPA.
		const result = await this.db.execute(sql<{
			query: string;
			total_impressions: number;
			total_clicks: number;
			avg_position: number;
			best_page: string;
		}>`
			WITH per_page AS (
				SELECT
					query,
					page,
					SUM(clicks)::bigint AS clicks,
					SUM(impressions)::bigint AS impressions,
					CASE WHEN SUM(impressions) > 0
					     THEN SUM(position * impressions) / SUM(impressions)
					     ELSE 0 END AS weighted_position
				FROM gsc_observations
				WHERE project_id = ${projectId}
					-- Exclude observations from unlinked properties so the cockpit
					-- only surfaces data from currently-active GSC properties.
					-- Bug A of #164: unlinking a property left historical rows
					-- in gsc_observations contributing to the cockpit until they
					-- aged out of the window. This subquery makes unlink immediate.
					AND gsc_property_id IN (
						SELECT id FROM gsc_properties
						WHERE project_id = ${projectId} AND unlinked_at IS NULL
					)
					AND observed_at >= now() - (${windowDays}::int * interval '1 day')
					AND query <> ''
				GROUP BY query, page
			)
			SELECT
				query,
				SUM(impressions)::bigint AS total_impressions,
				SUM(clicks)::bigint AS total_clicks,
				CASE WHEN SUM(impressions) > 0
				     THEN SUM(weighted_position * impressions) / SUM(impressions)
				     ELSE 0 END AS avg_position,
				(ARRAY_AGG(page ORDER BY clicks DESC, impressions DESC))[1] AS best_page
			FROM per_page
			GROUP BY query
			HAVING SUM(impressions) >= ${minImpr}
			ORDER BY total_impressions DESC
			LIMIT ${limit}
		`);
		type Row = {
			query: string;
			total_impressions: number;
			total_clicks: number;
			avg_position: number;
			best_page: string | null;
		};
		const rows = unwrap<Row>(result);
		return rows.map((r) => ({
			query: r.query,
			totalImpressions: Number(r.total_impressions),
			totalClicks: Number(r.total_clicks),
			avgPosition: Number(r.avg_position),
			bestPage: r.best_page === '' ? null : r.best_page,
		}));
	}

	async weeklyClicksByQuery(
		projectId: ProjectManagement.ProjectId,
		windowDays: number,
	): Promise<readonly SearchConsoleInsights.WeeklyClicksByQueryRow[]> {
		const result = await this.db.execute(sql<{
			week_start: string;
			query: string;
			clicks: number;
			impressions: number;
		}>`
			SELECT
				date_trunc('week', observed_at)::timestamptz AS week_start,
				query,
				SUM(clicks)::bigint AS clicks,
				SUM(impressions)::bigint AS impressions
			FROM gsc_observations
			WHERE project_id = ${projectId}
				AND gsc_property_id IN (
					SELECT id FROM gsc_properties WHERE project_id = ${projectId} AND unlinked_at IS NULL
				)
				AND observed_at >= now() - (${windowDays}::int * interval '1 day')
				AND query <> ''
			GROUP BY week_start, query
			ORDER BY week_start ASC, clicks DESC
		`);
		// postgres-js (3.4.x) returns timestamptz from raw `db.execute()` as
		// the original ISO string (e.g. `"2026-04-27 00:00:00+00"`), NOT a
		// Date object — its built-in type parsers only kick in for the
		// schema-typed query builder. The use case calls `.toISOString()`
		// on `weekStart`, so we coerce here at the repo boundary.
		type Row = { week_start: string | Date; query: string; clicks: number; impressions: number };
		const rows = unwrap<Row>(result);
		return rows.map((r) => ({
			weekStart: toDate(r.week_start),
			query: r.query,
			clicks: Number(r.clicks),
			impressions: Number(r.impressions),
		}));
	}

	async dailyTotalsForProject(
		projectId: ProjectManagement.ProjectId,
		windowDays: number,
	): Promise<readonly SearchConsoleInsights.DailyClicksImpressionsRow[]> {
		// One row per UTC day, summed across every dimension (query, page,
		// country, device, GSC property). We DON'T filter `query <> ''` here
		// because the forecast wants TOTAL traffic — including discover-only
		// / opaque rows GSC returns without a query value.
		const result = await this.db.execute(sql<{
			day: string;
			clicks: number;
			impressions: number;
		}>`
			SELECT
				date_trunc('day', observed_at)::timestamptz AS day,
				SUM(clicks)::bigint AS clicks,
				SUM(impressions)::bigint AS impressions
			FROM gsc_observations
			WHERE project_id = ${projectId}
				AND gsc_property_id IN (
					SELECT id FROM gsc_properties WHERE project_id = ${projectId} AND unlinked_at IS NULL
				)
				AND observed_at >= now() - (${windowDays}::int * interval '1 day')
			GROUP BY day
			ORDER BY day ASC
		`);
		// See `weeklyClicksByQuery` — postgres-js returns timestamptz as a
		// raw string for `db.execute()` queries; the forecast use case calls
		// `.getTime()` on `day` so we coerce here.
		type Row = { day: string | Date; clicks: number | string | null; impressions: number | string | null };
		const rows = unwrap<Row>(result);
		return rows.map((r) => ({
			day: toDate(r.day),
			clicks: Number(r.clicks ?? 0),
			impressions: Number(r.impressions ?? 0),
		}));
	}
}

const toDate = (v: string | Date): Date => (v instanceof Date ? v : new Date(v));
