import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import { type DataForSeoHttp, ensureTaskOk } from '../http.js';

/**
 * Issue #128: DataForSEO Labs `domain_intersection/live` returns the keywords
 * where two domains co-rank in Google's top-100 — when used with
 * `intersection_mode: 'one_intersect'` it returns only keywords ranking for
 * the FIRST target that DO NOT rank for the SECOND. To capture the
 * "competitor-only" gap (the lever for fagocitar), we pass
 * `[competitorDomain, ourDomain]` so the API returns keywords where the
 * competitor ranks and we don't. See `buildDomainIntersectionBody` for the
 * concrete swap.
 */
export const DomainIntersectionParams = z.object({
	/**
	 * `[primary, secondary]` tuple. The manifest/ACL convention treats element
	 * 0 as the COMPETITOR and element 1 as OUR domain so `one_intersect` mode
	 * returns the competitor-only keyword set (the gap we want to fagocitar).
	 */
	targets: z.tuple([z.string().min(3).max(253), z.string().min(3).max(253)]),
	locationCode: z.number().int().min(1).max(99_999_999),
	languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	intersectionMode: z.enum(['intersect', 'one_intersect', 'two_intersect']).default('one_intersect'),
	limit: z.number().int().min(1).max(1000).default(100),
});
export type DomainIntersectionParams = z.infer<typeof DomainIntersectionParams>;

/**
 * DataForSEO charges ~$0.02 per 100 results for this endpoint. We declare a
 * flat 2 cents and reconcile against the upstream's reported `cost` via the
 * provider-connectivity api_usage ledger.
 */
export const DOMAIN_INTERSECTION_COST_CENTS = 2;

export const domainIntersectionDescriptor: EndpointDescriptor = {
	id: 'dataforseo-labs-domain-intersection',
	category: 'rankings',
	displayName: 'DataForSEO Labs — domain intersection (competitor keyword gaps)',
	description:
		'Keywords where the competitor ranks in Google top-100 but our domain either does not, or ranks worse. Powers the competitor-keyword-gap read model — output sorted by ROI score (volume × cpc) / (kd + 1).',
	paramsSchema: DomainIntersectionParams,
	cost: { unit: 'usd_cents', amount: DOMAIN_INTERSECTION_COST_CENTS },
	// Weekly refresh on Monday 09:00 UTC. The upstream rebuilds Labs data on
	// a multi-day cadence so daily polling wastes budget.
	defaultCron: '0 9 * * 1',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/dataforseo_labs/google/domain_intersection/live';

export interface DomainIntersectionSerpElement {
	type?: string;
	rank_group?: number | null;
	rank_absolute?: number | null;
	url?: string | null;
	domain?: string | null;
	etv?: number | null;
}

export interface DomainIntersectionItem {
	keyword_data?: {
		keyword?: string;
		keyword_info?: {
			search_volume?: number | null;
			cpc?: number | null;
			competition?: number | null;
		};
		keyword_properties?: {
			keyword_difficulty?: number | null;
		};
	};
	/** Present for both `intersect` and `one_intersect`/`two_intersect` modes. */
	first_domain_serp_element?: DomainIntersectionSerpElement | null;
	/**
	 * Only populated when `intersection_mode === 'intersect'`. For
	 * `one_intersect` (the default) the second domain doesn't rank, so this is
	 * absent or null.
	 */
	second_domain_serp_element?: DomainIntersectionSerpElement | null;
}

export interface DomainIntersectionResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{ total_count?: number; items?: DomainIntersectionItem[] }>;
	}>;
}

export const buildDomainIntersectionBody = (params: DomainIntersectionParams): unknown[] => [
	{
		// `targets[0]` = competitor (primary), `targets[1]` = our domain (secondary).
		// With `intersection_mode: 'one_intersect'` (default) the API returns
		// keywords ranked by the primary that are NOT ranked by the secondary
		// — exactly the competitor-only gap we want to fagocitar.
		targets: [params.targets[0], params.targets[1]],
		location_code: params.locationCode,
		language_code: params.languageCode,
		intersection_mode: params.intersectionMode,
		limit: params.limit,
	},
];

export const fetchDomainIntersection = async (
	http: DataForSeoHttp,
	params: DomainIntersectionParams,
	ctx: FetchContext,
): Promise<DomainIntersectionResponse> => {
	const body = buildDomainIntersectionBody(params);
	const raw = (await http.post(
		PATH,
		body,
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as DomainIntersectionResponse;
	ensureTaskOk(PATH, raw);
	return raw;
};
