import { CompetitorIntelligence, type ProjectManagement } from '@rankpulse/domain';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { type CompetitorPageAuditRow, competitorPageAudits } from '../../schema/index.js';

/**
 * Issue #131: persists fat competitor URL audits and exposes the latest
 * snapshot for either:
 *   - a specific URL (returns at most one row), or
 *   - the entire competitor (returns one row per URL — DISTINCT ON (url)
 *     ORDER BY url, observed_at DESC).
 *
 * The natural-key PK on the hypertable absorbs idempotent re-runs at the
 * same `observedAt`; `saveAll` reports `inserted = audits.length` because
 * postgres-js doesn't surface row counts under `onConflictDoNothing` — same
 * convention as `DrizzleCompetitorKeywordGapRepository`.
 */
export class DrizzleCompetitorPageAuditRepository
	implements CompetitorIntelligence.CompetitorPageAuditRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async saveAll(
		audits: readonly CompetitorIntelligence.CompetitorPageAudit[],
	): Promise<{ inserted: number }> {
		if (audits.length === 0) return { inserted: 0 };
		await this.db
			.insert(competitorPageAudits)
			.values(
				audits.map((a) => ({
					observedAt: a.observedAt,
					projectId: a.projectId,
					competitorDomain: a.competitorDomain,
					url: a.url,
					statusCode: a.statusCode,
					statusMessage: a.statusMessage,
					fetchTimeMs: a.fetchTimeMs,
					pageSizeBytes: a.pageSizeBytes,
					title: a.title,
					metaDescription: a.metaDescription,
					h1: a.h1,
					h2Count: a.h2Count,
					h3Count: a.h3Count,
					wordCount: a.wordCount,
					plainTextSizeBytes: a.plainTextSizeBytes,
					internalLinksCount: a.internalLinksCount,
					externalLinksCount: a.externalLinksCount,
					hasSchemaOrg: a.hasSchemaOrg,
					schemaTypes: [...a.schemaTypes],
					canonicalUrl: a.canonicalUrl,
					redirectUrl: a.redirectUrl,
					lcpMs: a.lcpMs,
					cls: a.cls,
					ttfbMs: a.ttfbMs,
					domSize: a.domSize,
					isAmp: a.isAmp,
					isJavascript: a.isJavascript,
					isHttps: a.isHttps,
					hreflangCount: a.hreflangCount,
					ogTagsCount: a.ogTagsCount,
					sourceProvider: a.sourceProvider,
					rawPayloadId: a.rawPayloadId,
					observedAtProvider: a.observedAtProvider,
				})),
			)
			.onConflictDoNothing();
		return { inserted: audits.length };
	}

	async listLatestForCompetitor(
		projectId: ProjectManagement.ProjectId,
		competitorDomain: string,
		opts: CompetitorIntelligence.ListCompetitorPageAuditsOptions = {},
	): Promise<readonly CompetitorIntelligence.CompetitorPageAudit[]> {
		const limit = opts.limit ?? 500;
		if (opts.url != null) {
			const rows = await this.db
				.select()
				.from(competitorPageAudits)
				.where(
					and(
						eq(competitorPageAudits.projectId, projectId),
						eq(competitorPageAudits.competitorDomain, competitorDomain),
						eq(competitorPageAudits.url, opts.url),
					),
				)
				.orderBy(desc(competitorPageAudits.observedAt))
				.limit(1);
			return rows.map((r) => this.rehydrate(r));
		}
		// Postgres-only: DISTINCT ON (url) ... ORDER BY url, observed_at DESC
		// keeps the projection to one row per URL — the most recent audit. The
		// outer `.sort` after fetch re-orders by recency so the API surface
		// returns "freshest first" rather than alphabetical-by-url.
		const rows = await this.db
			.selectDistinctOn([competitorPageAudits.url])
			.from(competitorPageAudits)
			.where(
				and(
					eq(competitorPageAudits.projectId, projectId),
					eq(competitorPageAudits.competitorDomain, competitorDomain),
				),
			)
			.orderBy(competitorPageAudits.url, desc(competitorPageAudits.observedAt))
			.limit(limit);
		return rows
			.slice()
			.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
			.map((r) => this.rehydrate(r));
	}

	private rehydrate(r: CompetitorPageAuditRow): CompetitorIntelligence.CompetitorPageAudit {
		return CompetitorIntelligence.CompetitorPageAudit.rehydrate({
			id: `${r.observedAt.toISOString()}#${r.projectId}#${r.competitorDomain}#${r.url}` as CompetitorIntelligence.CompetitorPageAuditId,
			observedAt: r.observedAt,
			projectId: r.projectId as ProjectManagement.ProjectId,
			competitorDomain: r.competitorDomain,
			url: r.url,
			statusCode: r.statusCode,
			statusMessage: r.statusMessage,
			fetchTimeMs: r.fetchTimeMs,
			pageSizeBytes: r.pageSizeBytes,
			title: r.title,
			metaDescription: r.metaDescription,
			h1: r.h1,
			h2Count: r.h2Count,
			h3Count: r.h3Count,
			wordCount: r.wordCount,
			plainTextSizeBytes: r.plainTextSizeBytes,
			internalLinksCount: r.internalLinksCount,
			externalLinksCount: r.externalLinksCount,
			hasSchemaOrg: r.hasSchemaOrg,
			schemaTypes: r.schemaTypes ?? [],
			canonicalUrl: r.canonicalUrl,
			redirectUrl: r.redirectUrl,
			lcpMs: r.lcpMs,
			cls: r.cls,
			ttfbMs: r.ttfbMs,
			domSize: r.domSize,
			isAmp: r.isAmp,
			isJavascript: r.isJavascript,
			isHttps: r.isHttps,
			hreflangCount: r.hreflangCount,
			ogTagsCount: r.ogTagsCount,
			sourceProvider: r.sourceProvider,
			rawPayloadId: r.rawPayloadId,
			observedAtProvider: r.observedAtProvider,
		});
	}
}
