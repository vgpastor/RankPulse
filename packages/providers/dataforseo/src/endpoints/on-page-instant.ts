import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { DataForSeoHttp } from '../http.js';

export const OnPageInstantParams = z.object({
	url: z.string().url(),
	enableJavascript: z.boolean().default(false),
	loadResources: z.boolean().default(false),
	customUserAgent: z.string().max(255).optional(),
});
export type OnPageInstantParams = z.infer<typeof OnPageInstantParams>;

/** $0.00125/page (live). */
export const ON_PAGE_INSTANT_COST_CENTS = 0.125;

export const onPageInstantDescriptor: EndpointDescriptor = {
	id: 'on-page-instant-pages',
	category: 'onpage',
	displayName: 'On-Page — instant page audit',
	description:
		'Single-URL audit returning meta tags, headings, response timing, status code and content metrics. Powers the on-page snapshot for tracked pages.',
	paramsSchema: OnPageInstantParams,
	cost: { unit: 'usd_cents', amount: ON_PAGE_INSTANT_COST_CENTS },
	defaultCron: '0 13 * * *',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/on_page/instant_pages';

export interface OnPagePageMetrics {
	url: string;
	status_code?: number;
	meta?: {
		title?: string;
		description?: string;
		canonical?: string;
	};
	checks?: Record<string, boolean>;
	page_timing?: {
		time_to_interactive?: number;
		dom_complete?: number;
		largest_contentful_paint?: number;
	};
	content?: {
		plain_text_word_count?: number;
		plain_text_size?: number;
	};
	resource_errors?: { errors?: Array<{ message?: string; line?: number }> };
}

export interface OnPageInstantResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{ crawl_progress?: string; items?: OnPagePageMetrics[] }>;
	}>;
}

export const buildOnPageInstantBody = (params: OnPageInstantParams): unknown[] => [
	{
		url: params.url,
		enable_javascript: params.enableJavascript,
		load_resources: params.loadResources,
		custom_user_agent: params.customUserAgent,
	},
];

export const fetchOnPageInstantPages = async (
	http: DataForSeoHttp,
	params: OnPageInstantParams,
	ctx: FetchContext,
): Promise<OnPageInstantResponse> => {
	const body = buildOnPageInstantBody(params);
	const raw = (await http.post(PATH, body, ctx.credential.plaintextSecret, ctx.signal)) as OnPageInstantResponse;
	if (raw.status_code !== 20000) {
		ctx.logger.warn('DataForSEO on-page instant returned a non-success status', {
			status: raw.status_code,
			message: raw.status_message,
		});
	}
	return raw;
};
