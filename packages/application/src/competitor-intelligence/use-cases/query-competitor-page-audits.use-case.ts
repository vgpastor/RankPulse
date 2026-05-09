import type { CompetitorIntelligence, ProjectManagement } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryCompetitorPageAuditsCommand {
	projectId: string;
	competitorDomain: string;
	url?: string;
	limit?: number;
}

export interface CompetitorPageAuditEntryDto {
	observedAt: string;
	competitorDomain: string;
	url: string;
	statusCode: number | null;
	statusMessage: string | null;
	fetchTimeMs: number | null;
	pageSizeBytes: number | null;
	title: string | null;
	metaDescription: string | null;
	h1: string | null;
	h2Count: number | null;
	h3Count: number | null;
	wordCount: number | null;
	plainTextSizeBytes: number | null;
	internalLinksCount: number | null;
	externalLinksCount: number | null;
	hasSchemaOrg: boolean | null;
	schemaTypes: string[];
	canonicalUrl: string | null;
	redirectUrl: string | null;
	lcpMs: number | null;
	cls: number | null;
	ttfbMs: number | null;
	domSize: number | null;
	isAmp: boolean | null;
	isJavascript: boolean | null;
	isHttps: boolean | null;
	hreflangCount: number | null;
	ogTagsCount: number | null;
	sourceProvider: string;
	observedAtProvider: string | null;
}

export interface CompetitorPageAuditsResponseDto {
	rows: CompetitorPageAuditEntryDto[];
}

/**
 * Issue #131: read-side projection over `competitor_page_audits`.
 * - With `url` provided, returns the single latest audit for that URL.
 * - Without `url`, returns the latest audit per URL across the competitor.
 * Project existence is validated up-front so the controller doesn't need a
 * separate 404 check.
 */
export class QueryCompetitorPageAuditsUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly audits: CompetitorIntelligence.CompetitorPageAuditRepository,
	) {}

	async execute(cmd: QueryCompetitorPageAuditsCommand): Promise<CompetitorPageAuditsResponseDto> {
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const audits = await this.audits.listLatestForCompetitor(project.id, cmd.competitorDomain, {
			url: cmd.url,
			limit: cmd.limit,
		});
		const rows: CompetitorPageAuditEntryDto[] = audits.map((a) => ({
			observedAt: a.observedAt.toISOString(),
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
			observedAtProvider: a.observedAtProvider ? a.observedAtProvider.toISOString() : null,
		}));
		return { rows };
	}
}
