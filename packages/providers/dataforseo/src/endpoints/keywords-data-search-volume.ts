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
 * DataForSEO bills $0.05 per 1000 keywords (= 0.005 cents/keyword) for the
 * Google-Ads search-volume task. `cost.amount` advertises the max
 * worst-case (5¢ for the full 1000-batch); `costFor` computes the real
 * per-call cost from the batch size so the api_usage ledger matches the
 * provider's invoice.
 */
export const SEARCH_VOLUME_COST_CENTS_PER_KEYWORD = 0.005;
export const SEARCH_VOLUME_COST_CENTS_MAX = 5;

export const keywordsDataSearchVolumeDescriptor: EndpointDescriptor = {
	id: 'keywords-data-search-volume',
	category: 'keywords',
	displayName: 'Google Ads — search volume + CPC',
	description:
		'Monthly search volume, CPC and competition for up to 1000 keywords in a country/language. Underpins keyword prioritisation.',
	paramsSchema: KeywordsDataSearchVolumeParams,
	cost: { unit: 'usd_cents', amount: SEARCH_VOLUME_COST_CENTS_MAX },
	costFor: (raw) => {
		// Reuses the descriptor's own zod schema for safety. The processor
		// already validated `params` against this schema before dispatch,
		// so a parse failure here means the resolvedParams object lost
		// its shape between scheduling and billing — surface it loudly so
		// the operator notices rather than silently absorbing the worst-
		// case cost forever.
		const parsed = KeywordsDataSearchVolumeParams.safeParse(raw);
		if (!parsed.success) {
			throw new Error(
				`keywords-data-search-volume costFor: malformed params (${parsed.error.message}); falling back to worst-case`,
			);
		}
		return parsed.data.keywords.length * SEARCH_VOLUME_COST_CENTS_PER_KEYWORD;
	},
	// BACKLOG #4 fix — Google Ads search volume is updated MONTHLY upstream;
	// running daily wasted budget against unchanging data. Day 1 of every
	// month at 07:00 UTC.
	defaultCron: '0 7 1 * *',
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
	const raw = (await http.post(
		PATH,
		body,
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as SearchVolumeResponse;
	if (raw.status_code !== 20000) {
		ctx.logger.warn('DataForSEO search-volume returned a non-success status', {
			status: raw.status_code,
			message: raw.status_message,
		});
	}
	return raw;
};
