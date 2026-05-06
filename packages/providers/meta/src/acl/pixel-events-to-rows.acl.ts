import type { PixelEventsStatsResponse } from '../endpoints/pixel-events-stats.js';

/**
 * Domain-shaped row coming out of a `/{pixel-id}/stats` call. One row per
 * (observed_date, event_name) — a single pixel emits N events per day, so
 * the ingest writes N rows per `start_time` bucket.
 *
 * `valueSum` is the conversion-value sum FB attributes to the bucket; for
 * non-purchase events it's typically 0, so callers should not assume
 * presence implies revenue.
 */
export interface NormalizedPixelEventRow {
	observedDate: string; // YYYY-MM-DD
	eventName: string;
	count: number;
	valueSum: number;
}

const isYyyyMmDd = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

const startTimeToDate = (raw: string | undefined, fallback: string): string => {
	if (typeof raw !== 'string' || raw.length === 0) return fallback;
	// FB returns ISO-8601 with offset, e.g. "2025-01-01T00:00:00-0800". The
	// calendar-day part is the lead-in slice we care about.
	const slice = raw.slice(0, 10);
	return isYyyyMmDd(slice) ? slice : fallback;
};

const toFiniteNumber = (raw: number | string | undefined): number => {
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	if (typeof raw === 'string') {
		const n = Number(raw);
		if (Number.isFinite(n)) return n;
	}
	return 0;
};

/**
 * Pure ACL: Meta Pixel `/{pixel-id}/stats` response → normalized event rows. The
 * outer `data[]` is a list of time buckets (we ask Meta for daily
 * granularity), each containing an inner `data[]` of event-name aggregates.
 */
export const extractPixelEventRows = (
	response: PixelEventsStatsResponse,
	fallbackDate: string,
): NormalizedPixelEventRow[] => {
	const out: NormalizedPixelEventRow[] = [];
	for (const bucket of response.data ?? []) {
		const observedDate = startTimeToDate(bucket.start_time, fallbackDate);
		for (const row of bucket.data ?? []) {
			if (typeof row.event !== 'string' || row.event.length === 0) continue;
			out.push({
				observedDate,
				eventName: row.event,
				count: toFiniteNumber(row.count),
				valueSum: toFiniteNumber(row.value),
			});
		}
	}
	return out;
};
