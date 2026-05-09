import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { CompetitorPageAuditId } from '../value-objects/identifiers.js';

export interface CompetitorPageAuditProps {
	id: CompetitorPageAuditId;
	observedAt: Date;
	projectId: ProjectId;
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
	sourceProvider: string;
	rawPayloadId: string | null;
	observedAtProvider: Date | null;
}

/**
 * Issue #131: a fat snapshot of a competitor URL's on-page audit produced by
 * DataForSEO's `on_page/instant_pages` endpoint. Persisted in the
 * `competitor_page_audits` hypertable (chunk 30d, retention 13mo).
 *
 * Passive read-model — no domain events. Auto-registration of competitor URLs
 * (e.g. from `ranked_keywords` top-N) is OUT OF SCOPE for #131; today the
 * operator creates a `JobDefinition` manually with
 * `systemParams: { scope: 'competitor', competitorDomain, projectId, url }`
 * so the ACL polymorphic guard can route the row into this aggregate.
 *
 * The "fat" projection mirrors as much of the DataForSEO response as we can
 * extract; the `raw_payloads` row holds the full payload so the ACL is
 * re-runnable for backfills if we add columns later.
 */
export class CompetitorPageAudit extends AggregateRoot {
	private constructor(private readonly props: CompetitorPageAuditProps) {
		super();
	}

	static record(input: CompetitorPageAuditProps): CompetitorPageAudit {
		return new CompetitorPageAudit({ ...input, schemaTypes: [...input.schemaTypes] });
	}

	static rehydrate(props: CompetitorPageAuditProps): CompetitorPageAudit {
		return new CompetitorPageAudit({ ...props, schemaTypes: [...props.schemaTypes] });
	}

	get id(): CompetitorPageAuditId {
		return this.props.id;
	}
	get observedAt(): Date {
		return this.props.observedAt;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get competitorDomain(): string {
		return this.props.competitorDomain;
	}
	get url(): string {
		return this.props.url;
	}
	get statusCode(): number | null {
		return this.props.statusCode;
	}
	get statusMessage(): string | null {
		return this.props.statusMessage;
	}
	get fetchTimeMs(): number | null {
		return this.props.fetchTimeMs;
	}
	get pageSizeBytes(): number | null {
		return this.props.pageSizeBytes;
	}
	get title(): string | null {
		return this.props.title;
	}
	get metaDescription(): string | null {
		return this.props.metaDescription;
	}
	get h1(): string | null {
		return this.props.h1;
	}
	get h2Count(): number | null {
		return this.props.h2Count;
	}
	get h3Count(): number | null {
		return this.props.h3Count;
	}
	get wordCount(): number | null {
		return this.props.wordCount;
	}
	get plainTextSizeBytes(): number | null {
		return this.props.plainTextSizeBytes;
	}
	get internalLinksCount(): number | null {
		return this.props.internalLinksCount;
	}
	get externalLinksCount(): number | null {
		return this.props.externalLinksCount;
	}
	get hasSchemaOrg(): boolean | null {
		return this.props.hasSchemaOrg;
	}
	get schemaTypes(): readonly string[] {
		return this.props.schemaTypes;
	}
	get canonicalUrl(): string | null {
		return this.props.canonicalUrl;
	}
	get redirectUrl(): string | null {
		return this.props.redirectUrl;
	}
	get lcpMs(): number | null {
		return this.props.lcpMs;
	}
	get cls(): number | null {
		return this.props.cls;
	}
	get ttfbMs(): number | null {
		return this.props.ttfbMs;
	}
	get domSize(): number | null {
		return this.props.domSize;
	}
	get isAmp(): boolean | null {
		return this.props.isAmp;
	}
	get isJavascript(): boolean | null {
		return this.props.isJavascript;
	}
	get isHttps(): boolean | null {
		return this.props.isHttps;
	}
	get hreflangCount(): number | null {
		return this.props.hreflangCount;
	}
	get ogTagsCount(): number | null {
		return this.props.ogTagsCount;
	}
	get sourceProvider(): string {
		return this.props.sourceProvider;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
	get observedAtProvider(): Date | null {
		return this.props.observedAtProvider;
	}
}
