import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { DataForSeoHttp } from '../http.js';

export const SerpGoogleOrganicAdvancedParams = z.object({
	keyword: z.string().min(1).max(700),
	locationCode: z.number().int().min(1).max(99_999_999),
	languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	device: z.enum(['desktop', 'mobile']).default('desktop'),
	depth: z.number().int().min(10).max(100).default(20),
});
export type SerpGoogleOrganicAdvancedParams = z.infer<typeof SerpGoogleOrganicAdvancedParams>;

/** Advanced SERP costs more than regular: ~$0.002/SERP. */
export const SERP_ADVANCED_COST_CENTS = 0.2;

export const serpGoogleOrganicAdvancedDescriptor: EndpointDescriptor = {
	id: 'serp-google-organic-advanced',
	category: 'rankings',
	displayName: 'Google Organic SERP — advanced (with features)',
	description:
		'Same SERP as the live regular endpoint plus full feature breakdown (featured snippets, PAA, knowledge graph, ads, local pack). Powers the SERP-features dashboard.',
	paramsSchema: SerpGoogleOrganicAdvancedParams,
	cost: { unit: 'usd_cents', amount: SERP_ADVANCED_COST_CENTS },
	defaultCron: '0 14 * * 0',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/serp/google/organic/live/advanced';

export interface SerpAdvancedItem {
	type: string;
	rank_group?: number;
	rank_absolute?: number;
	domain?: string;
	url?: string;
	title?: string;
	description?: string;
	featured_snippet?: unknown;
	people_also_ask_element?: unknown;
	knowledge_graph_element?: unknown;
	answer_box?: unknown;
}

export interface SerpAdvancedResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{
			keyword: string;
			items_count?: number;
			items?: SerpAdvancedItem[];
		}>;
	}>;
}

export const buildSerpAdvancedBody = (params: SerpGoogleOrganicAdvancedParams): unknown[] => [
	{
		keyword: params.keyword,
		location_code: params.locationCode,
		language_code: params.languageCode,
		device: params.device,
		depth: params.depth,
	},
];

export const fetchSerpGoogleOrganicAdvanced = async (
	http: DataForSeoHttp,
	params: SerpGoogleOrganicAdvancedParams,
	ctx: FetchContext,
): Promise<SerpAdvancedResponse> => {
	const body = buildSerpAdvancedBody(params);
	const raw = (await http.post(PATH, body, ctx.credential.plaintextSecret, ctx.signal)) as SerpAdvancedResponse;
	if (raw.status_code !== 20000) {
		ctx.logger.warn('DataForSEO SERP advanced returned a non-success status', {
			status: raw.status_code,
			message: raw.status_message,
		});
	}
	return raw;
};
