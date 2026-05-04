import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { GscHttp } from '../http.js';

const DimensionEnum = z.enum(['date', 'query', 'page', 'country', 'device', 'searchAppearance']);

export const SearchAnalyticsParams = z.object({
	siteUrl: z.string().min(1),
	startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	dimensions: z.array(DimensionEnum).min(1).max(4).default(['date']),
	rowLimit: z.number().int().min(1).max(25000).default(1000),
	startRow: z.number().int().min(0).default(0),
	type: z.enum(['web', 'image', 'video', 'news', 'discover', 'googleNews']).default('web'),
});
export type SearchAnalyticsParams = z.infer<typeof SearchAnalyticsParams>;

export const searchAnalyticsDescriptor: EndpointDescriptor = {
	id: 'gsc-search-analytics',
	category: 'rankings',
	displayName: 'GSC Search Analytics',
	description:
		'Real Google Search Console performance data (clicks, impressions, CTR, position) for a verified property. Free; rate-limited to 1200 req/min/user.',
	paramsSchema: SearchAnalyticsParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '0 5 * * *', // daily at 05:00 UTC, 2 days behind GSC's typical lag
	rateLimit: { max: 1200, durationMs: 60_000 },
};

export interface SearchAnalyticsRow {
	keys?: string[];
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
}

export interface SearchAnalyticsResponse {
	rows?: SearchAnalyticsRow[];
	responseAggregationType?: string;
}

export const fetchSearchAnalytics = async (
	http: GscHttp,
	params: SearchAnalyticsParams,
	ctx: FetchContext,
): Promise<SearchAnalyticsResponse> => {
	const path = `/webmasters/v3/sites/${encodeURIComponent(params.siteUrl)}/searchAnalytics/query`;
	const body = {
		startDate: params.startDate,
		endDate: params.endDate,
		dimensions: params.dimensions,
		rowLimit: params.rowLimit,
		startRow: params.startRow,
		type: params.type,
	};
	const raw = (await http.post(
		path,
		body,
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as SearchAnalyticsResponse;
	return raw;
};
