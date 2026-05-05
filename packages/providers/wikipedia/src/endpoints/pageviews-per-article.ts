import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { WikipediaHttp } from '../http.js';

/**
 * `pageviews-per-article` — the per-article daily/monthly view counts.
 * https://wikimedia.org/api/rest_v1/#/Pageviews_data
 *
 * `project` is the Wikipedia subdomain (e.g. `en.wikipedia.org`,
 * `es.wikipedia.org`). `article` is the URL-encoded title with
 * underscores in place of spaces (`Eiffel_Tower`, `Torre_Eiffel`).
 *
 * Date format is `YYYYMMDD` (or with hour `YYYYMMDDHH` for hourly).
 * `start` and `end` accept the BACKLOG #22 token form `{{today-N}}` —
 * the worker resolves them before dispatch.
 */
export const PageviewsPerArticleParams = z.object({
	project: z
		.string()
		.regex(/^[a-z]{2,3}(?:-[a-z]+)?\.wikipedia\.org$/, 'project must be like "en.wikipedia.org"'),
	article: z.string().min(1).max(255),
	access: z.enum(['all-access', 'desktop', 'mobile-app', 'mobile-web']).default('all-access'),
	agent: z.enum(['all-agents', 'user', 'spider', 'automated']).default('user'),
	granularity: z.enum(['daily', 'monthly']).default('daily'),
	start: z.string().regex(/^\d{8}$|^\{\{today(?:-\d+)?\}\}$/),
	end: z.string().regex(/^\d{8}$|^\{\{today(?:-\d+)?\}\}$/),
});
export type PageviewsPerArticleParams = z.infer<typeof PageviewsPerArticleParams>;

/**
 * Free API. Cost is bookkeeping only (so the api_usage ledger has a
 * row), pinned to 0 cents. We model the rate-limit at descriptor
 * level (~100 req/s globally per Wikimedia's robot policy) so the
 * scheduling layer doesn't fan out beyond that.
 */
export const PAGEVIEWS_COST_CENTS = 0;

export const pageviewsPerArticleDescriptor: EndpointDescriptor = {
	id: 'wikipedia-pageviews-per-article',
	category: 'brand',
	displayName: 'Wikipedia — pageviews per article',
	description:
		'Daily or monthly view counts for a single Wikipedia article in a given language project. Signal of brand / entity awareness over time.',
	paramsSchema: PageviewsPerArticleParams,
	cost: { unit: 'usd_cents', amount: PAGEVIEWS_COST_CENTS },
	defaultCron: '0 4 * * 1',
	rateLimit: { max: 200, durationMs: 1_000 },
};

export interface PageviewItem {
	project: string;
	article: string;
	granularity: string;
	timestamp: string;
	access: string;
	agent: string;
	views: number;
}

export interface PageviewsPerArticleResponse {
	items?: PageviewItem[];
}

const buildPath = (params: PageviewsPerArticleParams): string => {
	const segments = [
		'/metrics/pageviews/per-article',
		params.project,
		params.access,
		params.agent,
		encodeURIComponent(params.article),
		params.granularity,
		params.start,
		params.end,
	];
	return segments.join('/');
};

export const fetchPageviewsPerArticle = async (
	http: WikipediaHttp,
	params: PageviewsPerArticleParams,
	ctx: FetchContext,
): Promise<PageviewsPerArticleResponse> => {
	const raw = (await http.get(buildPath(params), ctx.signal)) as PageviewsPerArticleResponse;
	if (!raw || !Array.isArray(raw.items)) {
		ctx.logger.warn('Wikipedia pageviews response missing items array', { raw });
		return { items: [] };
	}
	return raw;
};
