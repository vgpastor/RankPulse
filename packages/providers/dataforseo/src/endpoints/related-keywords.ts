import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { DataForSeoHttp } from '../http.js';

export const RelatedKeywordsParams = z.object({
	keyword: z.string().min(1).max(700),
	locationCode: z.number().int().min(1).max(99_999_999),
	languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	depth: z.number().int().min(0).max(4).default(2),
	limit: z.number().int().min(1).max(1000).default(100),
});
export type RelatedKeywordsParams = z.infer<typeof RelatedKeywordsParams>;

export const RELATED_KEYWORDS_COST_CENTS = 1;

export const relatedKeywordsDescriptor: EndpointDescriptor = {
	id: 'dataforseo-labs-related-keywords',
	category: 'keywords',
	displayName: 'DataForSEO Labs — related keywords',
	description:
		'Hierarchical related-keywords graph (Google "related searches") seeded from one keyword. Useful for content expansion.',
	paramsSchema: RelatedKeywordsParams,
	cost: { unit: 'usd_cents', amount: RELATED_KEYWORDS_COST_CENTS },
	defaultCron: '0 10 * * 0',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/dataforseo_labs/google/related_keywords/live';

export interface RelatedKeywordItem {
	keyword_data?: {
		keyword: string;
		keyword_info?: {
			search_volume?: number | null;
			cpc?: number | null;
			competition?: number | null;
		};
	};
	depth?: number;
	related_keywords?: string[];
}

export interface RelatedKeywordsResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{ total_count?: number; items?: RelatedKeywordItem[] }>;
	}>;
}

export const buildRelatedKeywordsBody = (params: RelatedKeywordsParams): unknown[] => [
	{
		keyword: params.keyword,
		location_code: params.locationCode,
		language_code: params.languageCode,
		depth: params.depth,
		limit: params.limit,
	},
];

export const fetchRelatedKeywords = async (
	http: DataForSeoHttp,
	params: RelatedKeywordsParams,
	ctx: FetchContext,
): Promise<RelatedKeywordsResponse> => {
	const body = buildRelatedKeywordsBody(params);
	const raw = (await http.post(PATH, body, ctx.credential.plaintextSecret, ctx.signal)) as RelatedKeywordsResponse;
	if (raw.status_code !== 20000) {
		ctx.logger.warn('DataForSEO related-keywords returned a non-success status', {
			status: raw.status_code,
			message: raw.status_message,
		});
	}
	return raw;
};
