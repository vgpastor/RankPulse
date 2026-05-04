import type { SearchAnalyticsParams, SearchAnalyticsResponse } from '../endpoints/search-analytics.js';

export interface NormalizedGscRow {
	observedAt: Date;
	query: string | null;
	page: string | null;
	country: string | null;
	device: string | null;
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
}

/**
 * Maps a GSC search-analytics response into normalized rows ready for the
 * search-console-insights ingest use case. The dimension order in the request
 * dictates the order of `row.keys`, so we project them by name using the
 * params used to make the call.
 */
export const extractGscRows = (
	response: SearchAnalyticsResponse,
	params: Pick<SearchAnalyticsParams, 'dimensions' | 'startDate' | 'endDate'>,
): NormalizedGscRow[] => {
	const rows = response.rows ?? [];
	const fallbackDate = new Date(`${params.endDate}T00:00:00Z`);
	return rows.map((row) => {
		const byDim = new Map<string, string>();
		params.dimensions.forEach((dim, idx) => {
			const key = row.keys?.[idx];
			if (key) byDim.set(dim, key);
		});
		const dateKey = byDim.get('date');
		const observedAt = dateKey ? new Date(`${dateKey}T00:00:00Z`) : fallbackDate;
		return {
			observedAt,
			query: byDim.get('query') ?? null,
			page: byDim.get('page') ?? null,
			country: byDim.get('country') ?? null,
			device: byDim.get('device') ?? null,
			clicks: row.clicks,
			impressions: row.impressions,
			ctr: row.ctr,
			position: row.position,
		};
	});
};
