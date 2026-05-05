import type { PageviewsPerArticleResponse } from '../endpoints/pageviews-per-article.js';

/**
 * Pageview observation in the ubiquitous language of `entity-awareness`:
 * one (article, day, views) tuple per row, ready to be persisted as a
 * domain row.
 *
 * The Wikimedia API timestamp comes as `YYYYMMDDHH` (always 00 for
 * daily granularity) — we normalise to a `Date` at midnight UTC of
 * that day so downstream queries can do range filtering trivially.
 */
export interface WikipediaPageviewExtraction {
	project: string;
	article: string;
	observedAt: Date;
	views: number;
	access: string;
	agent: string;
	granularity: string;
}

/**
 * Pure ACL: takes the raw Wikimedia REST payload and produces typed
 * observations. Filters out any item missing a required field instead
 * of throwing — Wikimedia occasionally returns partial rows for
 * articles with sparse history; we want best-effort persistence, not
 * a worker abort.
 */
export const extractPageviews = (
	payload: PageviewsPerArticleResponse,
): readonly WikipediaPageviewExtraction[] => {
	const items = payload.items ?? [];
	const out: WikipediaPageviewExtraction[] = [];
	for (const item of items) {
		const observedAt = parseWikimediaTimestamp(item.timestamp);
		if (!observedAt) continue;
		// `Number.isFinite` rejects NaN and ±Infinity; both are
		// observably present in the wild when Wikimedia backfills are
		// in progress for an article and the view counter hasn't
		// converged yet.
		if (!Number.isFinite(item.views) || item.views < 0) continue;
		out.push({
			project: item.project,
			article: item.article,
			observedAt,
			views: Math.round(item.views),
			access: item.access,
			agent: item.agent,
			granularity: item.granularity,
		});
	}
	return out;
};

const parseWikimediaTimestamp = (raw: string): Date | null => {
	// `YYYYMMDDHH` (10 chars) for daily, `YYYYMMDD00` for monthly bucket.
	if (typeof raw !== 'string') return null;
	if (raw.length !== 10 || !/^\d{10}$/.test(raw)) return null;
	const year = Number(raw.slice(0, 4));
	const month = Number(raw.slice(4, 6));
	const day = Number(raw.slice(6, 8));
	const hour = Number(raw.slice(8, 10));
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) return null;
	return new Date(Date.UTC(year, month - 1, day, hour, 0, 0, 0));
};
