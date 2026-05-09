import type { BacklinksSummaryResponse } from '../endpoints/backlinks-summary.js';

export interface BacklinksProfileSummary {
	readonly target: string | null;
	readonly totalBacklinks: number;
	readonly referringDomains: number;
	readonly referringMainDomains: number;
	readonly referringPages: number;
	readonly brokenBacklinks: number;
	readonly spamScore: number | null;
	readonly rank: number | null;
	readonly firstSeenAt: string | null;
	readonly lostAt: string | null;
}

/**
 * Anti-Corruption Layer: turns a raw DataForSEO `backlinks/summary/live`
 * payload into the typed shape the project-management context consumes.
 * The provider's response is heavily nested and partial-by-default; we
 * normalise to non-null primitives plus a few reference timestamps.
 */
export const summariseBacklinksResponse = (raw: BacklinksSummaryResponse): BacklinksProfileSummary => {
	const item = raw.tasks?.[0]?.result?.[0];
	if (!item) {
		return {
			target: null,
			totalBacklinks: 0,
			referringDomains: 0,
			referringMainDomains: 0,
			referringPages: 0,
			brokenBacklinks: 0,
			spamScore: null,
			rank: null,
			firstSeenAt: null,
			lostAt: null,
		};
	}
	return {
		target: item.target ?? null,
		totalBacklinks: item.backlinks ?? 0,
		referringDomains: item.referring_domains ?? 0,
		referringMainDomains: item.referring_main_domains ?? 0,
		referringPages: item.referring_pages ?? 0,
		brokenBacklinks: item.broken_backlinks ?? 0,
		spamScore: typeof item.backlinks_spam_score === 'number' ? item.backlinks_spam_score : null,
		rank: typeof item.rank === 'number' ? item.rank : null,
		firstSeenAt: item.first_seen ?? null,
		lostAt: item.lost_date ?? null,
	};
};
