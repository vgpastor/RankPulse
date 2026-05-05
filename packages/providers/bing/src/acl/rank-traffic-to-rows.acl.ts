import type { RankAndTrafficStatsResponse } from '../endpoints/rank-and-traffic-stats.js';

export interface NormalizedBingDailyRow {
	observedDate: string; // YYYY-MM-DD
	clicks: number;
	impressions: number;
	avgClickPosition: number | null;
	avgImpressionPosition: number | null;
}

/**
 * Bing serialises dates as `/Date(<ms>)/` (Microsoft JSON Date format).
 * Pull out the milliseconds, build a UTC date, drop to YYYY-MM-DD.
 *
 * Returns null for any value the regex doesn't match — we'd rather drop a
 * malformed row than insert a poisoned date.
 */
const MS_DATE_REGEX = /\/Date\((-?\d+)\)\//;

const parseMsDate = (raw: string | undefined): string | null => {
	if (!raw) return null;
	const match = MS_DATE_REGEX.exec(raw);
	if (!match || match[1] === undefined) return null;
	const ms = Number(match[1]);
	if (!Number.isFinite(ms)) return null;
	const d = new Date(ms);
	if (!Number.isFinite(d.getTime())) return null;
	return d.toISOString().slice(0, 10);
};

const toNumber = (raw: number | undefined): number => {
	if (raw === undefined || raw === null) return 0;
	return Number.isFinite(raw) ? raw : 0;
};

const toNullableNumber = (raw: number | undefined): number | null => {
	if (raw === undefined || raw === null) return null;
	if (!Number.isFinite(raw) || raw < 0) return null;
	return raw;
};

/**
 * Pure ACL: GetRankAndTrafficStats payload → normalised daily rows.
 * Drops rows with a malformed `/Date(ms)/` value rather than synthesising
 * a fallback — the natural-key write would otherwise create a phantom row.
 */
export const extractDailyRows = (response: RankAndTrafficStatsResponse): NormalizedBingDailyRow[] => {
	const rows = response.d ?? [];
	const out: NormalizedBingDailyRow[] = [];
	for (const row of rows) {
		const observedDate = parseMsDate(row.Date);
		if (!observedDate) continue;
		out.push({
			observedDate,
			clicks: toNumber(row.Clicks),
			impressions: toNumber(row.Impressions),
			avgClickPosition: toNullableNumber(row.AvgClickPosition),
			avgImpressionPosition: toNullableNumber(row.AvgImpressionPosition),
		});
	}
	return out;
};
