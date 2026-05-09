import type { AclContext } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import type { OnPageInstantResponse, OnPagePageMetrics } from '../endpoints/on-page-instant.js';

/**
 * Anti-Corruption Layer output: a fat row mirroring the
 * `competitor_page_audits` hypertable. Every metric column is nullable on
 * purpose — DataForSEO frequently omits fields when they don't apply (e.g.
 * `lcp_ms` for non-rendered fetches), and the use case persists what is
 * available without rejecting the row.
 */
export interface CompetitorPageAuditAclRow {
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
	observedAtProvider: Date | null;
}

/**
 * DataForSEO's `on_page/instant_pages` response is shared between two
 * scopes: own-domain audits (web-performance BC, future) and competitor
 * audits (this BC, issue #131). The endpoint manifest carries a single
 * `IngestBinding`, so the ACL acts as a polymorphic switch keyed off
 * `ctx.systemParams.scope`:
 *
 *   - `scope === 'competitor'`  → emit ONE fat row per fetch (this ACL).
 *   - anything else (incl. absent or `'own'`) → return `[]` so the row
 *     never reaches the use case. The raw payload is still stored upstream
 *     by the processor, so a future web-performance binding could hook into
 *     a separate manifest entry without restructuring this one.
 *
 * `competitorDomain`, `projectId` and `url` are required when scope is
 * `'competitor'`. The `IngestBinding`'s `systemParamKey` declares `url`
 * (the router's hard precondition), but the row mapping needs all three —
 * we throw a clear `InvalidInputError` if any is missing so a misconfigured
 * schedule fails loudly instead of silently inserting a partial row.
 */
export const mapOnPageToCompetitorAudit = (
	response: OnPageInstantResponse,
	ctx: AclContext,
): CompetitorPageAuditAclRow[] => {
	const scope = ctx.systemParams.scope;
	if (scope !== 'competitor') {
		// Not a competitor-scoped fetch — nothing to ingest into this BC.
		return [];
	}
	const competitorDomain = ctx.systemParams.competitorDomain;
	const projectId = ctx.systemParams.projectId;
	const url = ctx.systemParams.url;
	if (typeof competitorDomain !== 'string' || competitorDomain.trim() === '') {
		throw new InvalidInputError(
			'on-page-instant ACL (competitor scope) requires `systemParams.competitorDomain`. ' +
				'A schedule without it is misconfigured.',
		);
	}
	if (typeof projectId !== 'string' || projectId.trim() === '') {
		throw new InvalidInputError(
			'on-page-instant ACL (competitor scope) requires `systemParams.projectId`. ' +
				'A schedule without it is misconfigured.',
		);
	}
	if (typeof url !== 'string' || url.trim() === '') {
		throw new InvalidInputError(
			'on-page-instant ACL (competitor scope) requires `systemParams.url`. ' +
				'A schedule without it is misconfigured.',
		);
	}

	const task = response.tasks?.[0];
	const item = task?.result?.[0]?.items?.[0];
	// `time` is documented on every DataForSEO task envelope but isn't typed
	// in the helper's response interface today. Read it defensively for the
	// clock-skew column (`observedAtProvider`).
	const observedAtProviderRaw = (task as { time?: string } | undefined)?.time;
	if (!item) {
		// DataForSEO returned an empty result set (e.g. fetch failed before any
		// metrics were captured). Emit a status-only row so operators still see
		// "we tried at T". Most fields fall through as null.
		return [
			{
				statusCode: null,
				statusMessage: null,
				fetchTimeMs: null,
				pageSizeBytes: null,
				title: null,
				metaDescription: null,
				h1: null,
				h2Count: null,
				h3Count: null,
				wordCount: null,
				plainTextSizeBytes: null,
				internalLinksCount: null,
				externalLinksCount: null,
				hasSchemaOrg: null,
				schemaTypes: [],
				canonicalUrl: null,
				redirectUrl: null,
				lcpMs: null,
				cls: null,
				ttfbMs: null,
				domSize: null,
				isAmp: null,
				isJavascript: null,
				isHttps: null,
				hreflangCount: null,
				ogTagsCount: null,
				observedAtProvider: parseProviderTime(observedAtProviderRaw),
			},
		];
	}

	return [projectItem(item, observedAtProviderRaw)];
};

// TODO(claude #131): the field paths below mirror the publicly documented
// DataForSEO `on_page/instant_pages` response shape, but the helper's TS
// interface only types the most-used keys. The remaining paths are read
// defensively via `(item as ExtraFields)?.x?.y`. If any path turns out to be
// wrong post-merge, the raw_payload is preserved so the ACL can be re-run.
interface ExtraOnPageFields {
	page_timing?: {
		time_to_interactive?: number;
		largest_contentful_paint?: number;
		dom_complete?: number;
		time_to_secure_connection?: number;
		waiting_time?: number;
		download_time?: number;
		duration_time?: number;
		fetch_start?: number;
		fetch_end?: number;
		ttfb?: number;
	};
	meta?: {
		title?: string;
		description?: string;
		canonical?: string;
		htags?: { h1?: string[]; h2?: string[]; h3?: string[] };
		internal_links_count?: number;
		external_links_count?: number;
		images_count?: number;
		scripts_count?: number;
		stylesheets_count?: number;
		content?: { plain_text_word_count?: number; plain_text_size?: number };
		social_media_tags?: Record<string, string>;
		hreflang_languages?: string[];
		og_tags?: Record<string, string>;
	};
	content?: {
		plain_text_word_count?: number;
		plain_text_size?: number;
	};
	checks?: Record<string, boolean | undefined> & {
		is_https?: boolean;
		canonical?: boolean;
		has_amp?: boolean;
		is_javascript?: boolean;
		cumulative_layout_shift?: number;
	};
	cumulative_layout_shift?: number;
	largest_contentful_paint?: number;
	total_dom_size?: number;
	dom_size?: number;
	size?: number;
	media_type?: string;
	server?: string;
	url_redirect?: string;
	location?: string;
	fetch_time?: string;
	status_message?: string;
	is_javascript?: boolean;
	is_amp?: boolean;
	schema_org?: Array<{ '@type'?: string; type?: string }>;
}

const projectItem = (
	rawItem: OnPagePageMetrics,
	providerTime: string | undefined,
): CompetitorPageAuditAclRow => {
	const item = rawItem as OnPagePageMetrics & ExtraOnPageFields;
	const meta = item.meta;
	const htags = meta?.htags;
	const content = item.content ?? meta?.content;
	const timing = item.page_timing;
	const schemaOrg = Array.isArray(item.schema_org) ? item.schema_org : [];
	const schemaTypeSet = new Set<string>();
	for (const entry of schemaOrg) {
		const t = entry?.['@type'] ?? entry?.type;
		if (typeof t === 'string' && t.trim() !== '') schemaTypeSet.add(t);
	}
	const schemaTypes = [...schemaTypeSet];
	const checks = item.checks ?? {};
	const statusCode = numberOrNull(item.status_code);
	const isRedirect = typeof statusCode === 'number' && statusCode >= 300 && statusCode < 400;
	const url = item.url ?? '';
	const isHttps =
		typeof checks.is_https === 'boolean'
			? checks.is_https
			: url.length > 0
				? url.startsWith('https://')
				: null;

	return {
		statusCode,
		statusMessage: typeof item.status_message === 'string' ? item.status_message : null,
		fetchTimeMs: numberOrNull(timing?.duration_time ?? timing?.dom_complete),
		pageSizeBytes: numberOrNull(item.size),
		title: nonEmptyString(meta?.title),
		metaDescription: nonEmptyString(meta?.description),
		h1: nonEmptyString(htags?.h1?.[0]),
		h2Count: arrayLengthOrNull(htags?.h2),
		h3Count: arrayLengthOrNull(htags?.h3),
		wordCount: numberOrNull(content?.plain_text_word_count),
		plainTextSizeBytes: numberOrNull(content?.plain_text_size),
		internalLinksCount: numberOrNull(meta?.internal_links_count),
		externalLinksCount: numberOrNull(meta?.external_links_count),
		hasSchemaOrg: schemaTypes.length > 0,
		schemaTypes,
		canonicalUrl: nonEmptyString(meta?.canonical),
		redirectUrl: isRedirect ? nonEmptyString(item.url_redirect ?? item.location) : null,
		lcpMs: numberOrNull(timing?.largest_contentful_paint ?? item.largest_contentful_paint),
		cls: numberOrNull(checks.cumulative_layout_shift ?? item.cumulative_layout_shift),
		ttfbMs: numberOrNull(timing?.ttfb ?? timing?.waiting_time),
		domSize: numberOrNull(item.dom_size ?? item.total_dom_size),
		isAmp: typeof checks.has_amp === 'boolean' ? checks.has_amp : booleanOrNull(item.is_amp),
		isJavascript:
			typeof checks.is_javascript === 'boolean' ? checks.is_javascript : booleanOrNull(item.is_javascript),
		isHttps,
		hreflangCount: arrayLengthOrNull(meta?.hreflang_languages),
		ogTagsCount: meta?.og_tags ? Object.keys(meta.og_tags).length : null,
		observedAtProvider: parseProviderTime(providerTime),
	};
};

const numberOrNull = (v: number | null | undefined): number | null =>
	typeof v === 'number' && Number.isFinite(v) ? v : null;

const booleanOrNull = (v: boolean | null | undefined): boolean | null => (typeof v === 'boolean' ? v : null);

const nonEmptyString = (v: string | null | undefined): string | null =>
	typeof v === 'string' && v.trim() !== '' ? v : null;

const arrayLengthOrNull = (v: readonly unknown[] | null | undefined): number | null =>
	Array.isArray(v) ? v.length : null;

const parseProviderTime = (raw: string | undefined): Date | null => {
	if (typeof raw !== 'string' || raw.trim() === '') return null;
	const t = Date.parse(raw);
	return Number.isNaN(t) ? null : new Date(t);
};
