import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { BingHttp } from '../http.js';

/**
 * `GetQueryStats` returns the top queries that drove clicks/impressions for
 * the verified site over the last 6 months. Bing aggregates these — there's
 * no per-day granularity per query like GSC offers; the daily timeline view
 * lives in `bing-rank-and-traffic-stats` instead.
 *
 * We snapshot this once per day and keep the latest aggregation under the
 * natural key (siteUrl, query, observed_date). Day-over-day diffs are
 * derived in the read model.
 */
export const QueryStatsParams = z.object({
	siteUrl: z.string().url(),
});
export type QueryStatsParams = z.infer<typeof QueryStatsParams>;

export const queryStatsDescriptor: EndpointDescriptor = {
	id: 'bing-query-stats',
	category: 'rankings',
	displayName: 'Bing Query Stats',
	description:
		'Top queries (last 6 months) that drove clicks/impressions on a verified Bing property. Free, key-authenticated.',
	paramsSchema: QueryStatsParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '0 6 * * *',
	rateLimit: { max: 60, durationMs: 60_000 },
};

export interface QueryStatsRow {
	Query?: string;
	Clicks?: number;
	Impressions?: number;
	AvgClickPosition?: number;
	AvgImpressionPosition?: number;
}

export interface QueryStatsResponse {
	d?: QueryStatsRow[];
}

export const fetchQueryStats = async (
	http: BingHttp,
	params: QueryStatsParams,
	ctx: FetchContext,
): Promise<QueryStatsResponse> => {
	const raw = (await http.get(
		'GetQueryStats',
		{ siteUrl: params.siteUrl },
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as QueryStatsResponse;
	return raw;
};
