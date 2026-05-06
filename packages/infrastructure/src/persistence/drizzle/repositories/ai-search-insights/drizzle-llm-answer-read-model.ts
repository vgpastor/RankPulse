import { AiSearchInsights, type ProjectManagement } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';

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
		const rows = await this.db.execute(sql<{
			total_answers: number;
			answers_with_own_mention: number;
			own_citation_count: number;
			own_avg_position: number | null;
			competitor_mention_count: number;
		}>`
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
			FROM llm_answers
			WHERE project_id = ${projectId}
			  AND captured_at BETWEEN ${filter.from} AND ${filter.to}
		`);
		const row = (rows as unknown as { rows?: unknown[] }).rows?.[0] ?? rows[0];
		const r = row as {
			total_answers: number;
			answers_with_own_mention: number;
			own_citation_count: number;
			own_avg_position: number | null;
			competitor_mention_count: number;
		};
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
				SELECT id, ai_provider, country, language, mentions, citations
				FROM llm_answers
				WHERE project_id = ${projectId}
				  AND captured_at BETWEEN ${filter.from} AND ${filter.to}
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
				FROM base b, jsonb_array_elements(b.mentions) m
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
		const list = ((rows as unknown as { rows?: unknown[] }).rows ?? rows) as Array<{
			ai_provider: string;
			country: string;
			language: string;
			brand: string;
			is_own_brand: boolean;
			total_answers: number;
			answers_with_mention: number;
			avg_position: number | null;
			citation_count: number;
		}>;
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
				FROM llm_answers a, jsonb_array_elements(a.citations) c
				WHERE a.project_id = ${projectId}
				  AND a.captured_at BETWEEN ${filter.from} AND ${filter.to}
				  AND (${aiProvider}::text IS NULL OR a.ai_provider = ${aiProvider}::text)
			)
			SELECT
				url,
				domain,
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
		const list = ((rows as unknown as { rows?: unknown[] }).rows ?? rows) as Array<{
			url: string;
			domain: string;
			is_own_domain: boolean;
			total_citations: number;
			providers: string[];
			first_seen_at: Date | string;
			last_seen_at: Date | string;
		}>;
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
		const rows = await this.db.execute(sql<{
			day: string;
			total_answers: number;
			answers_with_own_mention: number;
		}>`
			SELECT
				to_char(captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
				COUNT(*)::int AS total_answers,
				COUNT(*) FILTER (
					WHERE jsonb_path_exists(mentions, '$[*] ? (@.isOwnBrand == true)')
				)::int AS answers_with_own_mention
			FROM llm_answers
			WHERE brand_prompt_id = ${brandPromptId}
			  AND captured_at BETWEEN ${filter.from} AND ${filter.to}
			GROUP BY day
			ORDER BY day
		`);
		const list = ((rows as unknown as { rows?: unknown[] }).rows ?? rows) as Array<{
			day: string;
			total_answers: number;
			answers_with_own_mention: number;
		}>;
		return list.map((r) => ({
			day: r.day,
			totalAnswers: Number(r.total_answers ?? 0),
			answersWithOwnMention: Number(r.answers_with_own_mention ?? 0),
		}));
	}
}
