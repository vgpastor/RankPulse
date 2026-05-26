import type { ProjectManagement } from '@rankpulse/domain';
import { sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';

/**
 * #172 — single round-trip summary of when each upstream subsystem last
 * ingested data for a project. All sub-queries scope by `project_id` so
 * the work doesn't grow with org size, only with project depth.
 *
 * One row, many columns. Sub-queries instead of UNION ALL because each
 * source has a slightly different shape (count vs paused-count vs
 * provider-array). A few of the sources store dates as text
 * `YYYY-MM-DD` (ga4_daily_metrics, bing_traffic_observations,
 * clarity_daily_metrics) — we project them to `timestamptz` at UTC
 * midnight so the API surface is uniform ISO 8601.
 */
const unwrap = <T>(rows: unknown): T[] => ((rows as { rows?: unknown[] }).rows ?? (rows as unknown[])) as T[];

interface FreshnessRow {
	rankings_last: Date | string | null;
	rankings_count: number;
	ai_search_last: Date | string | null;
	ai_search_count: number;
	ai_providers: string[] | null;
	brand_prompts_active: number;
	brand_prompts_paused: number;
	ga4_last: Date | string | null;
	ga4_count: number;
	gsc_last: Date | string | null;
	gsc_count: number;
	bing_last: Date | string | null;
	bing_count: number;
	pagespeed_last: Date | string | null;
	pagespeed_count: number;
	clarity_last: Date | string | null;
	clarity_count: number;
}

export class DrizzleProjectFreshnessReadModel implements ProjectManagement.ProjectFreshnessReadModel {
	constructor(private readonly db: DrizzleDatabase) {}

	async summarize(
		projectId: ProjectManagement.ProjectId,
	): Promise<ProjectManagement.ProjectFreshnessSummary> {
		const result = await this.db.execute(sql<FreshnessRow>`
			SELECT
				(SELECT MAX(observed_at) FROM ranking_observations WHERE project_id = ${projectId}::uuid) AS rankings_last,
				(SELECT COUNT(*)::int FROM ranking_observations WHERE project_id = ${projectId}::uuid) AS rankings_count,

				(SELECT MAX(captured_at) FROM llm_answers WHERE project_id = ${projectId}::uuid) AS ai_search_last,
				(SELECT COUNT(*)::int FROM llm_answers WHERE project_id = ${projectId}::uuid) AS ai_search_count,
				(SELECT COALESCE(array_agg(DISTINCT ai_provider ORDER BY ai_provider), '{}'::text[])
					FROM llm_answers WHERE project_id = ${projectId}::uuid) AS ai_providers,

				(SELECT COUNT(*)::int FROM brand_prompts WHERE project_id = ${projectId}::uuid AND paused_at IS NULL) AS brand_prompts_active,
				(SELECT COUNT(*)::int FROM brand_prompts WHERE project_id = ${projectId}::uuid AND paused_at IS NOT NULL) AS brand_prompts_paused,

				(SELECT MAX((observed_date || 'T00:00:00Z')::timestamptz)
					FROM ga4_daily_metrics WHERE project_id = ${projectId}::uuid) AS ga4_last,
				(SELECT COUNT(*)::int FROM ga4_properties
					WHERE project_id = ${projectId}::uuid AND unlinked_at IS NULL) AS ga4_count,

				(SELECT MAX(observed_at) FROM gsc_observations WHERE project_id = ${projectId}::uuid) AS gsc_last,
				(SELECT COUNT(*)::int FROM gsc_properties
					WHERE project_id = ${projectId}::uuid AND unlinked_at IS NULL) AS gsc_count,

				(SELECT MAX((observed_date || 'T00:00:00Z')::timestamptz)
					FROM bing_traffic_observations WHERE project_id = ${projectId}::uuid) AS bing_last,
				(SELECT COUNT(*)::int FROM bing_properties
					WHERE project_id = ${projectId}::uuid AND unlinked_at IS NULL) AS bing_count,

				(SELECT MAX(observed_at) FROM page_speed_snapshots WHERE project_id = ${projectId}::uuid) AS pagespeed_last,
				(SELECT COUNT(*)::int FROM tracked_pages WHERE project_id = ${projectId}::uuid) AS pagespeed_count,

				(SELECT MAX((observed_date || 'T00:00:00Z')::timestamptz)
					FROM clarity_daily_metrics WHERE project_id = ${projectId}::uuid) AS clarity_last,
				(SELECT COUNT(*)::int FROM clarity_projects
					WHERE project_id = ${projectId}::uuid AND unlinked_at IS NULL) AS clarity_count
		`);

		const row = unwrap<FreshnessRow>(result)[0];
		const ts = (v: Date | string | null): Date | null => {
			if (v == null) return null;
			return v instanceof Date ? v : new Date(v);
		};
		return {
			projectId,
			checkedAt: new Date(),
			sources: {
				rankings: { lastSeenAt: ts(row?.rankings_last ?? null), count: Number(row?.rankings_count ?? 0) },
				aiSearch: {
					lastSeenAt: ts(row?.ai_search_last ?? null),
					count: Number(row?.ai_search_count ?? 0),
					providers: row?.ai_providers ?? [],
				},
				brandPrompts: {
					activeCount: Number(row?.brand_prompts_active ?? 0),
					pausedCount: Number(row?.brand_prompts_paused ?? 0),
				},
				ga4: { lastSeenAt: ts(row?.ga4_last ?? null), count: Number(row?.ga4_count ?? 0) },
				gsc: { lastSeenAt: ts(row?.gsc_last ?? null), count: Number(row?.gsc_count ?? 0) },
				bing: { lastSeenAt: ts(row?.bing_last ?? null), count: Number(row?.bing_count ?? 0) },
				pageSpeed: {
					lastSeenAt: ts(row?.pagespeed_last ?? null),
					count: Number(row?.pagespeed_count ?? 0),
				},
				clarity: {
					lastSeenAt: ts(row?.clarity_last ?? null),
					count: Number(row?.clarity_count ?? 0),
				},
			},
		};
	}
}
