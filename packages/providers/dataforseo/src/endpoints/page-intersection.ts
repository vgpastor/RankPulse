import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import { type DataForSeoHttp, ensureTaskOk } from '../http.js';

/**
 * Issue #129: DataForSEO Labs `page_intersection/live` returns the URLs (across
 * one or more domains) that rank for a given set of keywords in Google's
 * top-100. Two complementary use cases:
 *
 *   1. Detect cluster cannibalisation INSIDE our own portfolio when multiple
 *      of our own URLs intersect the same keyword cluster.
 *   2. Identify competitor pages attacking a keyword cluster we care about.
 *
 * Raw-only ingest by design: payload lands in `raw_payloads` and is consumed
 * on demand. No hypertable, no read model — yet.
 */
// TODO(claude #129): Verify against canonical DataForSEO docs that `pages` is
// indeed an object map { domain -> string[] keywords } and that `intersections`
// caps at 20. Best-read sourced from issue brief.
export const PageIntersectionParams = z
	.object({
		/**
		 * Domain → array of keywords map. Up to 20 entries. Either `pages` or
		 * `keywords` must be provided (DataForSEO accepts either form).
		 */
		pages: z.record(z.string().min(3).max(253), z.array(z.string().min(1).max(700)).min(1)).optional(),
		/**
		 * Keyword set the API will intersect across all known domains. Either
		 * `pages` or `keywords` must be provided.
		 */
		keywords: z.array(z.string().min(1).max(700)).min(1).optional(),
		locationCode: z.number().int().min(1).max(99_999_999),
		languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
		/**
		 * Number of pages a URL must intersect (rank) for to be returned.
		 * Defaults to 1 (any keyword); higher values surface only URLs ranking
		 * for ≥ N of the supplied keywords — i.e. denser clusters.
		 */
		intersections: z.number().int().min(1).max(20).default(1),
		limit: z.number().int().min(1).max(1000).default(100),
	})
	.refine((v) => v.pages !== undefined || v.keywords !== undefined, {
		message: 'Either `pages` or `keywords` must be provided.',
		path: ['pages'],
	});
export type PageIntersectionParams = z.infer<typeof PageIntersectionParams>;

/**
 * DataForSEO charges ~$0.02 per call for this endpoint. Flat 2 cents declared;
 * the upstream's reported `cost` reconciles via the api_usage ledger.
 */
export const PAGE_INTERSECTION_COST_CENTS = 2;

export const pageIntersectionDescriptor: EndpointDescriptor = {
	id: 'dataforseo-labs-page-intersection',
	category: 'rankings',
	displayName: 'DataForSEO Labs — page intersection',
	description:
		'URLs (across one or more domains) that rank for a given set of keywords. Surfaces internal cluster cannibalisation and competitor pages attacking a keyword cluster.',
	paramsSchema: PageIntersectionParams,
	cost: { unit: 'usd_cents', amount: PAGE_INTERSECTION_COST_CENTS },
	// Monthly refresh on the 5th at 06:00 UTC. Low-volume endpoint (<10/mo) by
	// design; the underlying Labs index doesn't move fast enough to justify a
	// tighter cadence.
	defaultCron: '0 6 5 * *',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/dataforseo_labs/google/page_intersection/live';

export interface PageIntersectionItem {
	url?: string | null;
	domain?: string | null;
	intersections?: number | null;
	keywords?: string[] | null;
}

export interface PageIntersectionResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{ total_count?: number; items?: PageIntersectionItem[] }>;
	}>;
}

export const buildPageIntersectionBody = (params: PageIntersectionParams): unknown[] => {
	const entry: Record<string, unknown> = {
		location_code: params.locationCode,
		language_code: params.languageCode,
		intersections: params.intersections,
		limit: params.limit,
	};
	if (params.pages !== undefined) entry.pages = params.pages;
	if (params.keywords !== undefined) entry.keywords = params.keywords;
	return [entry];
};

export const fetchPageIntersection = async (
	http: DataForSeoHttp,
	params: PageIntersectionParams,
	ctx: FetchContext,
): Promise<PageIntersectionResponse> => {
	const body = buildPageIntersectionBody(params);
	const raw = (await http.post(
		PATH,
		body,
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as PageIntersectionResponse;
	ensureTaskOk(PATH, raw);
	return raw;
};
