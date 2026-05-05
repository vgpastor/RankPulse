import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { BingHttp } from '../http.js';

/**
 * `GetRankAndTrafficStats` returns ~6 months of daily totals for a verified
 * site: clicks, impressions, average click position, average impression
 * position. This is the Bing equivalent of GSC's date-bucketed performance
 * timeline — same shape, simpler call (no dimension picker, no row paging).
 *
 * The call returns the full 6-month window every time; we re-fetch daily
 * and let the natural-key PK on `(siteUrl, observedDate)` swallow re-writes.
 */
export const RankAndTrafficStatsParams = z.object({
	siteUrl: z.string().url(),
});
export type RankAndTrafficStatsParams = z.infer<typeof RankAndTrafficStatsParams>;

export const rankAndTrafficStatsDescriptor: EndpointDescriptor = {
	id: 'bing-rank-and-traffic-stats',
	category: 'rankings',
	displayName: 'Bing Rank & Traffic Stats',
	description:
		'Real Bing Webmaster traffic stats (daily clicks, impressions, average click & impression position) for a verified property. Free, key-authenticated.',
	paramsSchema: RankAndTrafficStatsParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '0 6 * * *', // daily 06:00 UTC, after Bing has rolled the previous day
	rateLimit: { max: 60, durationMs: 60_000 },
};

/**
 * Bing returns dates as `/Date(1709251200000)/` — that's the Microsoft JSON
 * serialiser format, the inner value is epoch milliseconds. We carry the raw
 * shape into the ACL and parse there so the fetcher stays a thin pass-through.
 */
export interface RankAndTrafficStatsRow {
	Date?: string; // /Date(<ms>)/
	Clicks?: number;
	Impressions?: number;
	AvgClickPosition?: number;
	AvgImpressionPosition?: number;
}

export interface RankAndTrafficStatsResponse {
	d?: RankAndTrafficStatsRow[];
}

export const fetchRankAndTrafficStats = async (
	http: BingHttp,
	params: RankAndTrafficStatsParams,
	ctx: FetchContext,
): Promise<RankAndTrafficStatsResponse> => {
	const raw = (await http.get(
		'GetRankAndTrafficStats',
		{ siteUrl: params.siteUrl },
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as RankAndTrafficStatsResponse;
	return raw;
};
