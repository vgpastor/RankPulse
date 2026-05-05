import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { DataForSeoHttp } from '../http.js';

export const KeywordsForSiteParams = z.object({
	target: z.string().min(3).max(253),
	locationCode: z.number().int().min(1).max(99_999_999),
	languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	limit: z.number().int().min(1).max(1000).default(100),
});
export type KeywordsForSiteParams = z.infer<typeof KeywordsForSiteParams>;

export const KEYWORDS_FOR_SITE_COST_CENTS = 1;

export const keywordsForSiteDescriptor: EndpointDescriptor = {
	id: 'dataforseo-labs-keywords-for-site',
	category: 'keywords',
	displayName: 'DataForSEO Labs — keywords for site',
	description:
		'Keywords a domain currently ranks for in the organic SERP, with rank, search volume and CPC. Drives the "what is my site already ranking for" board.',
	paramsSchema: KeywordsForSiteParams,
	cost: { unit: 'usd_cents', amount: KEYWORDS_FOR_SITE_COST_CENTS },
	defaultCron: '0 9 * * *',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/dataforseo_labs/google/keywords_for_site/live';

export interface KeywordsForSiteItem {
	keyword: string;
	location_code: number;
	language_code: string;
	keyword_info?: {
		search_volume?: number | null;
		cpc?: number | null;
		competition?: number | null;
	};
	ranked_serp_element?: {
		serp_item?: { rank_absolute?: number; url?: string; domain?: string };
	};
}

export interface KeywordsForSiteResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{ total_count?: number; items?: KeywordsForSiteItem[] }>;
	}>;
}

export const buildKeywordsForSiteBody = (params: KeywordsForSiteParams): unknown[] => [
	{
		target: params.target,
		location_code: params.locationCode,
		language_code: params.languageCode,
		limit: params.limit,
	},
];

export const fetchKeywordsForSite = async (
	http: DataForSeoHttp,
	params: KeywordsForSiteParams,
	ctx: FetchContext,
): Promise<KeywordsForSiteResponse> => {
	const body = buildKeywordsForSiteBody(params);
	const raw = (await http.post(PATH, body, ctx.credential.plaintextSecret, ctx.signal)) as KeywordsForSiteResponse;
	if (raw.status_code !== 20000) {
		ctx.logger.warn('DataForSEO keywords-for-site returned a non-success status', {
			status: raw.status_code,
			message: raw.status_message,
		});
	}
	return raw;
};
