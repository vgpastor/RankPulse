import { AiSearchInsights, type ProjectManagement } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';

/**
 * Bridges the two postgres-js result shapes drizzle-orm can return —
 * `pg-core`'s `Result` exposes the rows on a `.rows` property, while the
 * `postgres` driver returns the array directly. Each read-model method
 * needs the array shape; centralising the cast keeps the SQL focus on
 * what's interesting (the query).
 */
const unwrap = <T>(rows: unknown): T[] => ((rows as { rows?: unknown[] }).rows ?? (rows as unknown[])) as T[];

/**
 * On-the-fly aggregation queries against `llm_answers`. Each query relies on
 * the existing `(project_id, captured_at)` and
 * `(project_id, ai_provider, country, language, captured_at)` indexes; jsonb
 * array expansion is performed inline (`jsonb_array_elements`) since the
 * cardinality per row is bounded (typically <10 mentions, <5 citations).
 *
 * If volume grows beyond comfortable on-the-fly aggregation, the same shape
 * can be backed by a TimescaleDB continuous aggregate without changing the
 * `LlmAnswerReadModel` contract — the use cases never see the SQL.
 */
export class DrizzleLlmAnswerReadModel implements AiSearchInsights.LlmAnswerReadModel {
	constructor(private readonly db: DrizzleDatabase) {}

	async presenceForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<AiSearchInsights.AiSearchPresenceSummary> {
		// postgres-js (v3.4.x) does not auto-coerce `Date` objects passed
		// as `sql\`...\`` template parameters — Bind packet writer hits
		// `Buffer.byteLength(<Date>)` and throws ERR_INVALID_ARG_TYPE,
		// surfacing as a 500 from this read endpoint. Coercing to ISO
		// strings here keeps the query semantically identical (postgres
		// parses them as `timestamptz`) without round-tripping through
		// the driver's type registry.
		const fromIso = filter.from.toISOString();
		const toIso = filter.to.toISOString();
		const rows = await this.db.execute(sql<{
			total_answers: number;
			answers_with_own_mention: number;
			own_citation_count: number;
			own_avg_position: number | null;
			competitor_mention_count: number;
		}>`
			WITH base AS (
				SELECT
					CASE WHEN jsonb_typeof(mentions) = 'array' THEN mentions ELSE '[]'::jsonb END AS mentions,
					CASE WHEN jsonb_typeof(citations) = 'array' THEN citations ELSE '[]'::jsonb END AS citations
				FROM llm_answers
				WHERE project_id = ${projectId}
				  AND captured_at BETWEEN ${fromIso} AND ${toIso}
			)
			SELECT
				COUNT(*)::int AS total_answers,
				COUNT(*) FILTER (
					WHERE jsonb_path_exists(mentions, '$[*] ? (@.isOwnBrand == true)')
				)::int AS answers_with_own_mention,
				COALESCE(SUM(
					(SELECT COUNT(*) FROM jsonb_array_elements(citations) c
					 WHERE COALESCE((c->>'isOwnDomain')::bool, false))
				), 0)::int AS own_citation_count,
				AVG(
					(SELECT MIN((m->>'position')::int) FROM jsonb_array_elements(mentions) m
					 WHERE COALESCE((m->>'isOwnBrand')::bool, false))
				)::float AS own_avg_position,
				COALESCE(SUM(
					(SELECT COUNT(*) FROM jsonb_array_elements(mentions) m
					 WHERE NOT COALESCE((m->>'isOwnBrand')::bool, false))
				), 0)::int AS competitor_mention_count
			FROM base
		`);
		const r = unwrap<{
			total_answers: number;
			answers_with_own_mention: number;
			own_citation_count: number;
			own_avg_position: number | null;
			competitor_mention_count: number;
		}>(rows)[0];
		return {
			totalAnswers: Number(r?.total_answers ?? 0),
			answersWithOwnMention: Number(r?.answers_with_own_mention ?? 0),
			ownCitationCount: Number(r?.own_citation_count ?? 0),
			ownAvgPosition: r?.own_avg_position == null ? null : Number(r.own_avg_position),
			competitorMentionCount: Number(r?.competitor_mention_count ?? 0),
		};
	}

	async sovForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<readonly AiSearchInsights.AiSearchSovRow[]> {
		// See `presenceForProject` for the postgres-js Date binding rationale.
		const fromIso = filter.from.toISOString();
		const toIso = filter.to.toISOString();
		const rows = await this.db.execute(sql<{
			ai_provider: string;
			country: string;
			language: string;
			brand: string;
			is_own_brand: boolean;
			total_answers: number;
			answers_with_mention: number;
			avg_position: number | null;
			citation_count: number;
		}>`
			WITH base AS (
				SELECT id, ai_provider, country, language,
					CASE WHEN jsonb_typeof(mentions) = 'array' THEN mentions ELSE '[]'::jsonb END AS mentions,
					CASE WHEN jsonb_typeof(citations) = 'array' THEN citations ELSE '[]'::jsonb END AS citations
				FROM llm_answers
				WHERE project_id = ${projectId}
				  AND captured_at BETWEEN ${fromIso} AND ${toIso}
			),
			totals AS (
				SELECT ai_provider, country, language, COUNT(*)::int AS total_answers
				FROM base
				GROUP BY ai_provider, country, language
			),
			expanded AS (
				SELECT
					b.id AS answer_id,
					b.ai_provider,
					b.country,
					b.language,
					m->>'brand' AS brand,
					COALESCE((m->>'isOwnBrand')::bool, false) AS is_own_brand,
					(m->>'position')::int AS position,
					(SELECT COUNT(*) FROM jsonb_array_elements(b.citations) c
					 WHERE COALESCE((c->>'isOwnDomain')::bool, false)
					   AND c->>'url' = (m->>'citedUrl'))::int AS citation_count
				FROM base b
				CROSS JOIN LATERAL jsonb_array_elements(b.mentions) m
				WHERE m ? 'brand'
			)
			SELECT
				e.ai_provider,
				e.country,
				e.language,
				e.brand,
				bool_or(e.is_own_brand) AS is_own_brand,
				t.total_answers,
				COUNT(DISTINCT e.answer_id)::int AS answers_with_mention,
				AVG(e.position)::float AS avg_position,
				COALESCE(SUM(e.citation_count), 0)::int AS citation_count
			FROM expanded e
			JOIN totals t
				ON t.ai_provider = e.ai_provider
			   AND t.country = e.country
			   AND t.language = e.language
			GROUP BY e.ai_provider, e.country, e.language, e.brand, t.total_answers
			ORDER BY t.total_answers DESC, e.brand
		`);
		const list = unwrap<{
			ai_provider: string;
			country: string;
			language: string;
			brand: string;
			is_own_brand: boolean;
			total_answers: number;
			answers_with_mention: number;
			avg_position: number | null;
			citation_count: number;
		}>(rows);
		return list.map((r) => {
			if (!AiSearchInsights.isAiProviderName(r.ai_provider)) {
				throw new InvalidInputError(`SoV query returned unknown ai_provider "${r.ai_provider}"`);
			}
			return {
				aiProvider: r.ai_provider,
				country: r.country,
				language: r.language,
				brand: r.brand,
				isOwnBrand: Boolean(r.is_own_brand),
				totalAnswers: Number(r.total_answers ?? 0),
				answersWithMention: Number(r.answers_with_mention ?? 0),
				avgPosition: r.avg_position == null ? null : Number(r.avg_position),
				citationCount: Number(r.citation_count ?? 0),
			};
		});
	}

	async citationsForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter & {
			onlyOwnDomains?: boolean;
			aiProvider?: AiSearchInsights.AiProviderName;
		},
	): Promise<readonly AiSearchInsights.AiSearchCitationRow[]> {
		const onlyOwn = filter.onlyOwnDomains ?? false;
		const aiProvider = filter.aiProvider ?? null;
		// See `presenceForProject` for the postgres-js Date binding rationale.
		const fromIso = filter.from.toISOString();
		const toIso = filter.to.toISOString();
		const rows = await this.db.execute(sql<{
			url: string;
			domain: string;
			is_own_domain: boolean;
			total_citations: number;
			providers: string[];
			first_seen_at: Date;
			last_seen_at: Date;
		}>`
			WITH expanded AS (
				SELECT
					a.ai_provider,
					a.captured_at,
					c->>'url' AS url,
					c->>'domain' AS domain,
					COALESCE((c->>'isOwnDomain')::bool, false) AS is_own_domain
				FROM llm_answers a
				CROSS JOIN LATERAL jsonb_array_elements(
					CASE WHEN jsonb_typeof(a.citations) = 'array' THEN a.citations ELSE '[]'::jsonb END
				) c
				WHERE a.project_id = ${projectId}
				  AND a.captured_at BETWEEN ${fromIso} AND ${toIso}
				  AND (${aiProvider}::text IS NULL OR a.ai_provider = ${aiProvider}::text)
			)
			SELECT
				url,
				COALESCE(domain, '') AS domain,
				bool_or(is_own_domain) AS is_own_domain,
				COUNT(*)::int AS total_citations,
				array_agg(DISTINCT ai_provider) AS providers,
				MIN(captured_at) AS first_seen_at,
				MAX(captured_at) AS last_seen_at
			FROM expanded
			WHERE (${onlyOwn}::bool = false OR is_own_domain)
			  AND url IS NOT NULL
			GROUP BY url, domain
			ORDER BY total_citations DESC
			LIMIT 200
		`);
		const list = unwrap<{
			url: string;
			domain: string;
			is_own_domain: boolean;
			total_citations: number;
			providers: string[];
			first_seen_at: Date | string;
			last_seen_at: Date | string;
		}>(rows);
		return list.map((r) => ({
			url: r.url,
			domain: r.domain,
			isOwnDomain: Boolean(r.is_own_domain),
			totalCitations: Number(r.total_citations ?? 0),
			providers: (r.providers ?? []).filter((p): p is AiSearchInsights.AiProviderName =>
				AiSearchInsights.isAiProviderName(p),
			),
			firstSeenAt: r.first_seen_at instanceof Date ? r.first_seen_at : new Date(r.first_seen_at),
			lastSeenAt: r.last_seen_at instanceof Date ? r.last_seen_at : new Date(r.last_seen_at),
		}));
	}

	async sovDailyForPrompt(
		brandPromptId: AiSearchInsights.BrandPromptId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<readonly AiSearchInsights.AiSearchSovDailyPoint[]> {
		// See `presenceForProject` for the postgres-js Date binding rationale.
		const fromIso = filter.from.toISOString();
		const toIso = filter.to.toISOString();
		const rows = await this.db.execute(sql<{
			day: string;
			total_answers: number;
			answers_with_own_mention: number;
		}>`
			WITH base AS (
				SELECT
					captured_at,
					CASE WHEN jsonb_typeof(mentions) = 'array' THEN mentions ELSE '[]'::jsonb END AS mentions
				FROM llm_answers
				WHERE brand_prompt_id = ${brandPromptId}
				  AND captured_at BETWEEN ${fromIso} AND ${toIso}
			)
			SELECT
				to_char(captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
				COUNT(*)::int AS total_answers,
				COUNT(*) FILTER (
					WHERE jsonb_path_exists(mentions, '$[*] ? (@.isOwnBrand == true)')
				)::int AS answers_with_own_mention
			FROM base
			GROUP BY day
			ORDER BY day
		`);
		const list = unwrap<{
			day: string;
			total_answers: number;
			answers_with_own_mention: number;
		}>(rows);
		return list.map((r) => ({
			day: r.day,
			totalAnswers: Number(r.total_answers ?? 0),
			answersWithOwnMention: Number(r.answers_with_own_mention ?? 0),
		}));
	}

	async competitiveMatrixForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<readonly AiSearchInsights.AiSearchMatrixCell[]> {
		// Reuses the same SQL backbone as `sovForProject` so a brand only
		// appears as a matrix cell once it has at least one mention in the
		// window. Brands in the watchlist with zero mentions are gap-rendered
		// client-side (as 0% cells) — that keeps the SQL cheap and the
		// missing-brand case obvious in the UI heatmap.
		const sov = await this.sovForProject(projectId, filter);
		return sov.map((r) => ({
			aiProvider: r.aiProvider,
			country: r.country,
			language: r.language,
			brand: r.brand,
			isOwnBrand: r.isOwnBrand,
			totalAnswers: r.totalAnswers,
			answersWithMention: r.answersWithMention,
			avgPosition: r.avgPosition,
			mentionRate: r.totalAnswers === 0 ? 0 : r.answersWithMention / r.totalAnswers,
		}));
	}

	async weeklySovDeltaForProject(
		projectId: ProjectManagement.ProjectId,
		asOf: Date,
	): Promise<readonly AiSearchInsights.AiSearchWeeklySovDelta[]> {
		const thisWeekStart = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);
		const lastWeekStart = new Date(asOf.getTime() - 14 * 24 * 60 * 60 * 1000);
		// See `presenceForProject` for the postgres-js Date binding rationale.
		const asOfIso = asOf.toISOString();
		const thisWeekStartIso = thisWeekStart.toISOString();
		const lastWeekStartIso = lastWeekStart.toISOString();
		const rows = await this.db.execute(sql<{
			ai_provider: string;
			country: string;
			language: string;
			this_week_total: number;
			this_week_own_mentions: number;
			last_week_total: number;
			last_week_own_mentions: number;
		}>`
			WITH base AS (
				SELECT ai_provider, country, language, captured_at,
					CASE WHEN jsonb_typeof(mentions) = 'array' THEN mentions ELSE '[]'::jsonb END AS mentions
				FROM llm_answers
				WHERE project_id = ${projectId}
				  AND captured_at >= ${lastWeekStartIso}
				  AND captured_at <= ${asOfIso}
			)
			SELECT
				ai_provider,
				country,
				language,
				COUNT(*) FILTER (WHERE captured_at >= ${thisWeekStartIso})::int AS this_week_total,
				COUNT(*) FILTER (
					WHERE captured_at >= ${thisWeekStartIso}
					  AND jsonb_path_exists(mentions, '$[*] ? (@.isOwnBrand == true)')
				)::int AS this_week_own_mentions,
				COUNT(*) FILTER (
					WHERE captured_at >= ${lastWeekStartIso} AND captured_at < ${thisWeekStartIso}
				)::int AS last_week_total,
				COUNT(*) FILTER (
					WHERE captured_at >= ${lastWeekStartIso}
					  AND captured_at < ${thisWeekStartIso}
					  AND jsonb_path_exists(mentions, '$[*] ? (@.isOwnBrand == true)')
				)::int AS last_week_own_mentions
			FROM base
			GROUP BY ai_provider, country, language
		`);
		const list = unwrap<{
			ai_provider: string;
			country: string;
			language: string;
			this_week_total: number;
			this_week_own_mentions: number;
			last_week_total: number;
			last_week_own_mentions: number;
		}>(rows);
		return list
			.filter((r) => AiSearchInsights.isAiProviderName(r.ai_provider))
			.map((r) => {
				const thisWeekRate =
					r.this_week_total === 0 ? 0 : Number(r.this_week_own_mentions) / Number(r.this_week_total);
				const lastWeekRate =
					r.last_week_total === 0 ? 0 : Number(r.last_week_own_mentions) / Number(r.last_week_total);
				const relativeDelta = lastWeekRate === 0 ? null : (thisWeekRate - lastWeekRate) / lastWeekRate;
				return {
					aiProvider: r.ai_provider as AiSearchInsights.AiProviderName,
					country: r.country,
					language: r.language,
					thisWeekTotal: Number(r.this_week_total ?? 0),
					thisWeekOwnMentions: Number(r.this_week_own_mentions ?? 0),
					lastWeekTotal: Number(r.last_week_total ?? 0),
					lastWeekOwnMentions: Number(r.last_week_own_mentions ?? 0),
					thisWeekRate,
					lastWeekRate,
					relativeDelta,
				};
			});
	}

	async ownCitationStreaksForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<readonly AiSearchInsights.AiSearchOwnCitationStreak[]> {
		// See `presenceForProject` for the postgres-js Date binding rationale.
		const fromIso = filter.from.toISOString();
		const toIso = filter.to.toISOString();
		// Streak detection: for each (own_url × provider × locale) look at the
		// per-day citation presence and find the longest run of consecutive
		// days. The "currentlyCited" bit is the presence of the URL in the
		// most recent day with any answers. Done in two SQL passes (per-day
		// presence first, then a window function for streaks) to keep each
		// query bounded.
		const rows = await this.db.execute(sql<{
			url: string;
			domain: string;
			ai_provider: string;
			country: string;
			language: string;
			streak_days: number;
			last_seen_at: Date;
			currently_cited: boolean;
		}>`
			WITH per_day AS (
				SELECT
					a.ai_provider,
					a.country,
					a.language,
					c->>'url' AS url,
					c->>'domain' AS domain,
					to_char(a.captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
					BOOL_OR(COALESCE((c->>'isOwnDomain')::bool, false)) AS cited
				FROM llm_answers a
				CROSS JOIN LATERAL jsonb_array_elements(
					CASE WHEN jsonb_typeof(a.citations) = 'array' THEN a.citations ELSE '[]'::jsonb END
				) c
				WHERE a.project_id = ${projectId}
				  AND a.captured_at BETWEEN ${fromIso} AND ${toIso}
				  AND COALESCE((c->>'isOwnDomain')::bool, false) = true
				GROUP BY a.ai_provider, a.country, a.language, c->>'url', c->>'domain', day
			),
			ordered AS (
				SELECT *,
					row_number() OVER (PARTITION BY ai_provider, country, language, url ORDER BY day) AS rn,
					row_number() OVER (PARTITION BY ai_provider, country, language, url ORDER BY day)
						- (date(day) - date('1970-01-01')) AS grp
				FROM per_day
				WHERE cited
			),
			streaks AS (
				SELECT ai_provider, country, language, url, MAX(domain) AS domain,
					COUNT(*) AS streak_days,
					MAX(day) AS last_day
				FROM ordered
				GROUP BY ai_provider, country, language, url, grp
			),
			latest_per_locale AS (
				SELECT ai_provider, country, language,
					MAX(captured_at AT TIME ZONE 'UTC')::date AS last_capture_day
				FROM llm_answers
				WHERE project_id = ${projectId}
				  AND captured_at BETWEEN ${fromIso} AND ${toIso}
				GROUP BY ai_provider, country, language
			),
			top_streak AS (
				SELECT DISTINCT ON (ai_provider, country, language, url)
					ai_provider, country, language, url, domain, streak_days, last_day
				FROM streaks
				ORDER BY ai_provider, country, language, url, streak_days DESC, last_day DESC
			)
			SELECT
				t.url,
				t.domain,
				t.ai_provider,
				t.country,
				t.language,
				t.streak_days::int,
				(t.last_day || 'T00:00:00Z')::timestamptz AS last_seen_at,
				(t.last_day::date = l.last_capture_day) AS currently_cited
			FROM top_streak t
			JOIN latest_per_locale l USING (ai_provider, country, language)
		`);
		const list = unwrap<{
			url: string;
			domain: string;
			ai_provider: string;
			country: string;
			language: string;
			streak_days: number;
			last_seen_at: Date | string;
			currently_cited: boolean;
		}>(rows);
		return list
			.filter((r) => AiSearchInsights.isAiProviderName(r.ai_provider))
			.map((r) => ({
				url: r.url,
				domain: r.domain,
				aiProvider: r.ai_provider as AiSearchInsights.AiProviderName,
				country: r.country,
				language: r.language,
				streakDays: Number(r.streak_days ?? 0),
				lastSeenAt: r.last_seen_at instanceof Date ? r.last_seen_at : new Date(r.last_seen_at),
				currentlyCited: Boolean(r.currently_cited),
			}));
	}

	async positionLeadsForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<readonly AiSearchInsights.AiSearchPositionLead[]> {
		// See `presenceForProject` for the postgres-js Date binding rationale.
		const fromIso = filter.from.toISOString();
		const toIso = filter.to.toISOString();
		const rows = await this.db.execute(sql<{
			ai_provider: string;
			country: string;
			language: string;
			own_avg_position: number | null;
			competitor_brand: string;
			competitor_avg_position: number | null;
		}>`
			WITH expanded AS (
				SELECT a.ai_provider, a.country, a.language,
					m->>'brand' AS brand,
					COALESCE((m->>'isOwnBrand')::bool, false) AS is_own_brand,
					(m->>'position')::int AS position
				FROM llm_answers a
				CROSS JOIN LATERAL jsonb_array_elements(
					CASE WHEN jsonb_typeof(a.mentions) = 'array' THEN a.mentions ELSE '[]'::jsonb END
				) m
				WHERE a.project_id = ${projectId}
				  AND a.captured_at BETWEEN ${fromIso} AND ${toIso}
			),
			own_pos AS (
				SELECT ai_provider, country, language, AVG(position)::float AS own_avg_position
				FROM expanded
				WHERE is_own_brand = true
				GROUP BY ai_provider, country, language
			),
			competitor_pos AS (
				SELECT ai_provider, country, language, brand AS competitor_brand,
					AVG(position)::float AS competitor_avg_position
				FROM expanded
				WHERE is_own_brand = false
				GROUP BY ai_provider, country, language, brand
			)
			SELECT
				c.ai_provider,
				c.country,
				c.language,
				o.own_avg_position,
				c.competitor_brand,
				c.competitor_avg_position
			FROM competitor_pos c
			LEFT JOIN own_pos o
				ON o.ai_provider = c.ai_provider AND o.country = c.country AND o.language = c.language
		`);
		const list = unwrap<{
			ai_provider: string;
			country: string;
			language: string;
			own_avg_position: number | null;
			competitor_brand: string;
			competitor_avg_position: number | null;
		}>(rows);
		return list
			.filter((r) => AiSearchInsights.isAiProviderName(r.ai_provider))
			.map((r) => ({
				aiProvider: r.ai_provider as AiSearchInsights.AiProviderName,
				country: r.country,
				language: r.language,
				ownAvgPosition: r.own_avg_position == null ? null : Number(r.own_avg_position),
				competitorBrand: r.competitor_brand,
				competitorAvgPosition: r.competitor_avg_position == null ? null : Number(r.competitor_avg_position),
			}));
	}
}
