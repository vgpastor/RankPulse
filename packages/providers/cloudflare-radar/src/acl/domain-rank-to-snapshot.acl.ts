import type { DomainRankResponse } from '../endpoints/domain-rank.js';

export interface DomainRankSnapshot {
	observedDate: string; // YYYY-MM-DD — always the meta.lastUpdated date or today as fallback
	rank: number | null; // null when Cloudflare has no rank for the domain (long-tail, unranked)
	categories: Record<string, number>; // category name -> per-category rank
	bucket: string | null; // e.g. "200" / "200,000" — the order-of-magnitude bucket the domain falls in
}

/**
 * Pure ACL: `/radar/ranking/domain/<domain>` payload → a single typed
 * snapshot row. Long-tail domains return a 200 OK with `rank` undefined
 * (the domain isn't ranked); we surface that as `rank: null` rather than
 * dropping the row, because the absence is itself a signal worth tracking.
 */
export const extractSnapshot = (response: DomainRankResponse, fallbackToday: Date): DomainRankSnapshot => {
	const details = response.result?.details_0;
	const lastUpdated = response.result?.meta?.lastUpdated;
	const observedDate = parseLastUpdated(lastUpdated, fallbackToday);

	const categories: Record<string, number> = {};
	for (const c of details?.categories ?? []) {
		if (typeof c.name === 'string' && typeof c.rank === 'number' && Number.isFinite(c.rank)) {
			categories[c.name] = c.rank;
		}
	}

	return {
		observedDate,
		rank: typeof details?.rank === 'number' && Number.isFinite(details.rank) ? details.rank : null,
		categories,
		bucket: typeof details?.bucket === 'string' ? details.bucket : null,
	};
};

const parseLastUpdated = (raw: string | undefined, fallback: Date): string => {
	if (typeof raw === 'string' && raw.length > 0) {
		const d = new Date(raw);
		if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
	}
	return fallback.toISOString().slice(0, 10);
};
