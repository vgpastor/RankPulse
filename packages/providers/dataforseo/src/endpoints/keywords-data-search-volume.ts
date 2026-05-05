import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { DataForSeoHttp } from '../http.js';

export const KeywordsDataSearchVolumeParams = z.object({
	keywords: z.array(z.string().min(1).max(700)).min(1).max(1000),
	locationCode: z.number().int().min(1).max(99_999_999),
	languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
});
export type KeywordsDataSearchVolumeParams = z.infer<typeof KeywordsDataSearchVolumeParams>;

/**
 * $0.05/1000 keywords (live) — DataForSEO publishes 0.05¢/keyword for the
 * Google-Ads search-volume task. Cost is per-call so the descriptor's
 * `cost.amount` represents 1000 keywords. Operators batching <1000 still
 * pay the full call cost.
 */
export const SEARCH_VOLUME_COST_CENTS = 5;

export const keywordsDataSearchVolumeDescriptor: EndpointDescriptor = {
	id: 'keywords-data-search-volume',
	category: 'keywords',
	displayName: 'Google Ads — search volume + CPC',
	description:
		'Monthly search volume, CPC and competition for up to 1000 keywords in a country/language. Underpins keyword prioritisation.',
	paramsSchema: KeywordsDataSearchVolumeParams,
	cost: { unit: 'usd_cents', amount: SEARCH_VOLUME_COST_CENTS },
	defaultCron: '0 7 * * *',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/keywords_data/google_ads/search_volume/live';

export interface SearchVolumeResultItem {
	keyword: string;
	location_code: number;
	language_code: string;
	search_volume?: number | null;
	cpc?: number | null;
	competition?: number | null;
	competition_index?: number | null;
	monthly_searches?: Array<{ year: number; month: number; search_volume: number }>;
}

export interface SearchVolumeResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: SearchVolumeResultItem[];
	}>;
}

export const buildSearchVolumeBody = (params: KeywordsDataSearchVolumeParams): unknown[] => [
	{
		keywords: params.keywords,
		location_code: params.locationCode,
		language_code: params.languageCode,
	},
];

export const fetchKeywordsDataSearchVolume = async (
	http: DataForSeoHttp,
	params: KeywordsDataSearchVolumeParams,
	ctx: FetchContext,
): Promise<SearchVolumeResponse> => {
	const body = buildSearchVolumeBody(params);
	const raw = (await http.post(PATH, body, ctx.credential.plaintextSecret, ctx.signal)) as SearchVolumeResponse;
	if (raw.status_code !== 20000) {
		ctx.logger.warn('DataForSEO search-volume returned a non-success status', {
			status: raw.status_code,
			message: raw.status_message,
		});
	}
	return raw;
};
