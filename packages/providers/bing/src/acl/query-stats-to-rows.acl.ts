import type { QueryStatsResponse } from '../endpoints/query-stats.js';

export interface NormalizedBingQueryRow {
	query: string;
	clicks: number;
	impressions: number;
	avgClickPosition: number | null;
	avgImpressionPosition: number | null;
}

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
 * Pure ACL: GetQueryStats payload → normalised query rows. Bing returns
 * an aggregated view (no per-day granularity) so the read model stamps
 * `observedDate` itself when persisting — this layer just shapes the
 * row content.
 *
 * Empty/whitespace queries are dropped: they'd violate the natural-key
 * uniqueness on (siteUrl, observedDate, query) by colliding under the
 * same empty-string key.
 */
export const extractQueryRows = (response: QueryStatsResponse): NormalizedBingQueryRow[] => {
	const rows = response.d ?? [];
	const out: NormalizedBingQueryRow[] = [];
	for (const row of rows) {
		const q = row.Query?.trim();
		if (!q) continue;
		out.push({
			query: q,
			clicks: toNumber(row.Clicks),
			impressions: toNumber(row.Impressions),
			avgClickPosition: toNullableNumber(row.AvgClickPosition),
			avgImpressionPosition: toNullableNumber(row.AvgImpressionPosition),
		});
	}
	return out;
};
