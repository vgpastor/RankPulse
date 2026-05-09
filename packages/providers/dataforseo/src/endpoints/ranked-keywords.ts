import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import { type DataForSeoHttp, ensureTaskOk } from '../http.js';

export const RankedKeywordsParams = z.object({
	target: z.string().min(3).max(253),
	locationCode: z.number().int().min(1).max(99_999_999),
	languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	limit: z.number().int().min(1).max(1000).default(100),
});
export type RankedKeywordsParams = z.infer<typeof RankedKeywordsParams>;

/**
 * Issue #127: DataForSEO Labs `ranked_keywords/live` returns the full set of
 * keywords for which a target domain ranks in Google. Pricing is per-call
 * (~$0.01 / 100 results); we declare 1 cent flat and let the operator-side
 * cost ledger reconcile against the upstream's `cost` field if needed.
 */
export const RANKED_KEYWORDS_COST_CENTS = 1;

export const rankedKeywordsDescriptor: EndpointDescriptor = {
	id: 'dataforseo-labs-ranked-keywords',
	category: 'rankings',
	displayName: 'DataForSEO Labs — ranked keywords',
	description:
		'All keywords for which a target domain ranks on Google, with position, search volume, keyword difficulty, ETV (estimated traffic) and CPC. One snapshot per scheduled run; powers the keyword-portfolio read model.',
	paramsSchema: RankedKeywordsParams,
	cost: { unit: 'usd_cents', amount: RANKED_KEYWORDS_COST_CENTS },
	// Monthly snapshot on day 5 at 06:00 UTC. The data is rebuilt server-side
	// only periodically, so polling more often wastes budget without changing
	// the answer.
	defaultCron: '0 6 5 * *',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/dataforseo_labs/google/ranked_keywords/live';

export interface RankedKeywordsItem {
	/**
	 * The keyword info block holds the keyword string + volume + CPC. Wrapped
	 * because DataForSEO returns it nested under `keyword_data.keyword_info`
	 * on this endpoint (different from related-keywords' top-level shape).
	 */
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
	ranked_serp_element?: {
		serp_item?: {
			rank_group?: number | null;
			rank_absolute?: number | null;
			url?: string | null;
			etv?: number | null;
			estimated_paid_traffic_cost?: number | null;
		};
	};
}

export interface RankedKeywordsResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{ total_count?: number; items?: RankedKeywordsItem[] }>;
	}>;
}

export const buildRankedKeywordsBody = (params: RankedKeywordsParams): unknown[] => [
	{
		target: params.target,
		location_code: params.locationCode,
		language_code: params.languageCode,
		limit: params.limit,
	},
];

export const fetchRankedKeywords = async (
	http: DataForSeoHttp,
	params: RankedKeywordsParams,
	ctx: FetchContext,
): Promise<RankedKeywordsResponse> => {
	const body = buildRankedKeywordsBody(params);
	const raw = (await http.post(
		PATH,
		body,
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as RankedKeywordsResponse;
	ensureTaskOk(PATH, raw);
	return raw;
};
