import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { DataForSeoHttp } from '../http.js';

export const SerpGoogleOrganicLiveParams = z.object({
	keyword: z.string().min(1).max(700),
	locationCode: z.number().int().min(1).max(99_999_999),
	languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	device: z.enum(['desktop', 'mobile']).default('desktop'),
	depth: z.number().int().min(10).max(100).default(20),
});
export type SerpGoogleOrganicLiveParams = z.infer<typeof SerpGoogleOrganicLiveParams>;

/** $0.0035/query — validated against DataForSEO production in May 2026 (per PRD2). */
export const SERP_LIVE_COST_CENTS = 0.35;

export const serpGoogleOrganicLiveDescriptor: EndpointDescriptor = {
	id: 'serp-google-organic-live',
	category: 'rankings',
	displayName: 'Google Organic SERP — live',
	description:
		'Live Google organic SERP results for a keyword in a specific location/language/device. Used to track keyword positions weekly per country.',
	paramsSchema: SerpGoogleOrganicLiveParams,
	cost: { unit: 'usd_cents', amount: SERP_LIVE_COST_CENTS },
	defaultCron: '0 6 * * 1', // weekly Monday 06:00
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/serp/google/organic/live/regular';

export interface SerpResultItem {
	type: string;
	rank_group?: number;
	rank_absolute?: number;
	position?: string;
	domain?: string;
	url?: string;
	title?: string;
	description?: string;
	is_featured_snippet?: boolean;
}

export interface SerpLiveTask {
	status_code: number;
	status_message: string;
	cost?: number;
	result?: Array<{
		keyword: string;
		location_code: number;
		language_code: string;
		check_url?: string;
		datetime?: string;
		items_count?: number;
		items?: SerpResultItem[];
	}>;
}

export interface SerpLiveResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: SerpLiveTask[];
}

/** Builds the DataForSEO POST body for a single SERP live request. */
export const buildSerpLiveBody = (params: SerpGoogleOrganicLiveParams): unknown[] => [
	{
		keyword: params.keyword,
		location_code: params.locationCode,
		language_code: params.languageCode,
		device: params.device,
		depth: params.depth,
	},
];

export const fetchSerpGoogleOrganicLive = async (
	http: DataForSeoHttp,
	params: SerpGoogleOrganicLiveParams,
	ctx: FetchContext,
): Promise<SerpLiveResponse> => {
	const body = buildSerpLiveBody(params);
	const raw = (await http.post(PATH, body, ctx.credential.plaintextSecret, ctx.signal)) as SerpLiveResponse;
	if (raw.status_code !== 20000) {
		ctx.logger.warn('DataForSEO SERP live returned a non-success status', {
			status: raw.status_code,
			message: raw.status_message,
		});
	}
	return raw;
};
