import { CompetitorIntelligence, type ProjectManagement } from '@rankpulse/domain';
import { type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface CompetitorPageAuditFields {
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
	schemaTypes: readonly string[];
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
	observedAtProvider: Date | null;
}

export interface IngestCompetitorPageAuditCommand {
	projectId: string;
	competitorDomain: string;
	url: string;
	audit: CompetitorPageAuditFields;
	rawPayloadId: string | null;
	observedAt?: Date;
}

export interface IngestCompetitorPageAuditResult {
	ingested: number;
}

const SOURCE_PROVIDER = 'dataforseo';

/**
 * Issue #131: persists a single fat-row snapshot of a competitor URL audit
 * (DataForSEO `on_page/instant_pages`) into `competitor_page_audits`. Mirrors
 * the passive-observation ingest pattern of `IngestDomainIntersectionUseCase`
 * (#128): no domain events, the natural-key PK absorbs idempotent re-runs.
 *
 * One audit per fetch — `saveAll([single])` keeps the repository contract
 * uniform with the keyword-gap path.
 */
export class IngestCompetitorPageAuditUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly audits: CompetitorIntelligence.CompetitorPageAuditRepository,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: IngestCompetitorPageAuditCommand): Promise<IngestCompetitorPageAuditResult> {
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const observedAt = cmd.observedAt ?? new Date();
		const audit = CompetitorIntelligence.CompetitorPageAudit.record({
			id: this.ids.generate() as CompetitorIntelligence.CompetitorPageAuditId,
			observedAt,
			projectId: project.id,
			competitorDomain: cmd.competitorDomain,
			url: cmd.url,
			statusCode: cmd.audit.statusCode,
			statusMessage: cmd.audit.statusMessage,
			fetchTimeMs: cmd.audit.fetchTimeMs,
			pageSizeBytes: cmd.audit.pageSizeBytes,
			title: cmd.audit.title,
			metaDescription: cmd.audit.metaDescription,
			h1: cmd.audit.h1,
			h2Count: cmd.audit.h2Count,
			h3Count: cmd.audit.h3Count,
			wordCount: cmd.audit.wordCount,
			plainTextSizeBytes: cmd.audit.plainTextSizeBytes,
			internalLinksCount: cmd.audit.internalLinksCount,
			externalLinksCount: cmd.audit.externalLinksCount,
			hasSchemaOrg: cmd.audit.hasSchemaOrg,
			schemaTypes: cmd.audit.schemaTypes,
			canonicalUrl: cmd.audit.canonicalUrl,
			redirectUrl: cmd.audit.redirectUrl,
			lcpMs: cmd.audit.lcpMs,
			cls: cmd.audit.cls,
			ttfbMs: cmd.audit.ttfbMs,
			domSize: cmd.audit.domSize,
			isAmp: cmd.audit.isAmp,
			isJavascript: cmd.audit.isJavascript,
			isHttps: cmd.audit.isHttps,
			hreflangCount: cmd.audit.hreflangCount,
			ogTagsCount: cmd.audit.ogTagsCount,
			sourceProvider: SOURCE_PROVIDER,
			rawPayloadId: cmd.rawPayloadId,
			observedAtProvider: cmd.audit.observedAtProvider,
		});
		const { inserted } = await this.audits.saveAll([audit]);
		return { ingested: inserted };
	}
}
