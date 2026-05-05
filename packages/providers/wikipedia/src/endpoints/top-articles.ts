import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { WikipediaHttp } from '../http.js';

/**
 * `top-articles` — the most-viewed articles in a project on a given day
 * or month. Useful for trend monitoring and competitor entity discovery.
 *
 * Date model: { year, month, day } strings; pass `'all-days'` to get a
 * monthly aggregate.
 */
export const TopArticlesParams = z.object({
	project: z
		.string()
		.regex(/^[a-z]{2,3}(?:-[a-z]+)?\.wikipedia\.org$/, 'project must be like "en.wikipedia.org"'),
	access: z.enum(['all-access', 'desktop', 'mobile-app', 'mobile-web']).default('all-access'),
	year: z.string().regex(/^\d{4}$/),
	month: z.string().regex(/^\d{2}$/),
	day: z.string().regex(/^\d{2}$|^all-days$/),
});
export type TopArticlesParams = z.infer<typeof TopArticlesParams>;

export const TOP_ARTICLES_COST_CENTS = 0;

export const topArticlesDescriptor: EndpointDescriptor = {
	id: 'wikipedia-top-articles',
	category: 'brand',
	displayName: 'Wikipedia — top articles',
	description:
		'Top viewed articles in a Wikipedia project for a given day or month. Surfaces trending entities and what the broader audience is searching for.',
	paramsSchema: TopArticlesParams,
	cost: { unit: 'usd_cents', amount: TOP_ARTICLES_COST_CENTS },
	defaultCron: '0 5 1 * *',
	rateLimit: { max: 200, durationMs: 1_000 },
};

export interface TopArticleItem {
	article: string;
	views: number;
	rank: number;
}

export interface TopArticlesResponse {
	items?: Array<{
		project: string;
		access: string;
		year: string;
		month: string;
		day: string;
		articles?: TopArticleItem[];
	}>;
}

const buildPath = (params: TopArticlesParams): string =>
	['/metrics/pageviews/top', params.project, params.access, params.year, params.month, params.day].join('/');

export const fetchTopArticles = async (
	http: WikipediaHttp,
	params: TopArticlesParams,
	ctx: FetchContext,
): Promise<TopArticlesResponse> => {
	const raw = (await http.get(buildPath(params), ctx.signal)) as TopArticlesResponse;
	if (!raw || !Array.isArray(raw.items)) {
		ctx.logger.warn('Wikipedia top-articles response missing items array', { raw });
		return { items: [] };
	}
	return raw;
};
