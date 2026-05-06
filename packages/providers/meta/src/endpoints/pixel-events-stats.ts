import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { DATE_OR_TOKEN_REGEX } from '@rankpulse/shared';
import { z } from 'zod';
import type { MetaHttp } from '../http.js';

/**
 * `/{pixel-id}/stats` returns aggregated event counts for a Meta Pixel over
 * a time window. With `aggregation=event` the response is bucketed by
 * `event` (PageView, Purchase, AddToCart, ...); we ask for daily granularity
 * so the ingest can write one row per (pixel, day, event_name) without any
 * server-side aggregation.
 *
 * Daily cron at 04:30 UTC (after GA4 04:00) — Meta's pixel reporting has
 * the same ~1-hour ingestion lag as GA4, so 04:30 is safe for "yesterday".
 */
const PixelIdRegex = /^\d{8,}$/;

export const PixelEventsStatsParams = z.object({
	pixelId: z.string().regex(PixelIdRegex, 'pixelId must be a 8+ digit Meta Pixel id'),
	startDate: z.string().regex(DATE_OR_TOKEN_REGEX),
	endDate: z.string().regex(DATE_OR_TOKEN_REGEX),
});
export type PixelEventsStatsParams = z.infer<typeof PixelEventsStatsParams>;

export const pixelEventsStatsDescriptor: EndpointDescriptor = {
	id: 'meta-pixel-events-stats',
	category: 'traffic',
	displayName: 'Meta Pixel Events Stats',
	description:
		'Daily event counts and value-sum per event name from a Meta Pixel (PageView, Purchase, AddToCart...). Free under Marketing API; requires ads_read on the owning business.',
	paramsSchema: PixelEventsStatsParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '30 4 * * *',
	rateLimit: { max: 60, durationMs: 60_000 },
};

export interface PixelStatsRow {
	start_time?: string;
	end_time?: string;
	data?: Array<{ event?: string; count?: number; value?: number }>;
}
export interface PixelEventsStatsResponse {
	data?: PixelStatsRow[];
	paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

const toUnixSeconds = (yyyyMmDd: string, endOfDay: boolean): string => {
	// Meta's `start_time`/`end_time` accept Unix epoch seconds OR ISO 8601.
	// We canonicalise to UTC seconds so the request hash is stable.
	const isoDate = `${yyyyMmDd}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
	const t = Math.floor(new Date(isoDate).getTime() / 1000);
	return String(t);
};

export const fetchPixelEventsStats = async (
	http: MetaHttp,
	params: PixelEventsStatsParams,
	ctx: FetchContext,
): Promise<PixelEventsStatsResponse> => {
	const path = `/${encodeURIComponent(params.pixelId)}/stats`;
	const raw = (await http.get(
		path,
		{
			aggregation: 'event',
			start_time: toUnixSeconds(params.startDate, false),
			end_time: toUnixSeconds(params.endDate, true),
		},
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as PixelEventsStatsResponse;
	return raw;
};
