import type { SerpLiveResponse } from '../endpoints/serp-google-organic-live.js';

export interface SerpRankingExtraction {
	position: number | null;
	url: string | null;
	serpFeatures: readonly string[];
}

/**
 * Anti-Corruption Layer: turns a raw DataForSEO SERP live payload into the
 * shape the rank-tracking context expects (position + url + features).
 *
 * Lives in the provider package so changes to DataForSEO's response shape
 * stay isolated here, but the *output* speaks the rank-tracking ubiquitous
 * language. The functional context's use case treats this as untrusted input
 * and re-validates with Position.fromNullable().
 */
export const extractRankingForDomain = (payload: SerpLiveResponse, domain: string): SerpRankingExtraction => {
	const map = extractRankingsForDomains(payload, [domain]);
	return (
		map.get(normalizeDomain(domain)) ?? { position: null, url: null, serpFeatures: collectFeatures(payload) }
	);
};

/**
 * BACKLOG #12 + #15: extracts a `SerpRankingExtraction` for EACH domain in a
 * single pass over the same SERP payload — N domains × $0 instead of N
 * separate API calls × $0.0035. Returned map is keyed by the normalized
 * domain (lowercase, leading `www.` stripped) so callers can `.get(d)` with
 * the input string after normalizing it themselves.
 *
 * Pure function: no I/O, no logging. The processor is responsible for
 * deciding which domains to query for a given SERP (typically `project.domains`).
 */
export const extractRankingsForDomains = (
	payload: SerpLiveResponse,
	domains: readonly string[],
): Map<string, SerpRankingExtraction> => {
	const items = payload.tasks?.[0]?.result?.[0]?.items ?? [];
	const features = collectFeatures(payload);
	const targets = new Map<string, SerpRankingExtraction>();
	for (const d of domains) {
		const key = normalizeDomain(d);
		// Each domain starts with the same `serpFeatures` snapshot — features
		// describe the SERP, not the domain match.
		targets.set(key, { position: null, url: null, serpFeatures: features });
	}

	for (const item of items) {
		const itemDomain = item.domain ? normalizeDomain(item.domain) : null;
		if (!itemDomain) continue;
		const rank = item.rank_absolute ?? item.rank_group;
		if (typeof rank !== 'number' || rank <= 0) continue;

		for (const [target, current] of targets) {
			if (current.position !== null) continue; // already have first match for this target
			if (itemDomain === target || itemDomain.endsWith(`.${target}`)) {
				targets.set(target, {
					position: rank,
					url: item.url ?? null,
					serpFeatures: features,
				});
			}
		}
	}

	return targets;
};

export interface SerpResultRow {
	rank: number;
	domain: string;
	url: string | null;
	title: string | null;
}

/**
 * Issue #115: every distinct organic row in the top-N of the payload, with
 * `rank`, normalized `domain`, `url` and `title`. Powers the
 * `serp_observations` hypertable so the SERP-map UI can render top-10 cards
 * without JSONB-decoding raw_payloads on each request.
 *
 * - Only `type === 'organic'` items are emitted (paid/snippet/people-also-ask
 *   are not part of the competitive landscape we want to track).
 * - When two organic items collapse to the same normalised domain we keep
 *   the highest-ranked one (first seen) — the table's PK already enforces
 *   uniqueness on `(observed_at, …, rank)` not domain.
 * - `topN` defaults to 30 (DataForSEO's default depth) and is capped at 100.
 */
export const extractTopSerpResults = (payload: SerpLiveResponse, topN = 30): readonly SerpResultRow[] => {
	const cap = Math.min(Math.max(topN, 1), 100);
	const items = payload.tasks?.[0]?.result?.[0]?.items ?? [];
	const seenRanks = new Set<number>();
	const out: SerpResultRow[] = [];
	for (const item of items) {
		if (item.type !== 'organic') continue;
		const rank = item.rank_absolute ?? item.rank_group;
		if (typeof rank !== 'number' || rank <= 0 || rank > cap) continue;
		if (seenRanks.has(rank)) continue;
		if (!item.domain) continue;
		seenRanks.add(rank);
		out.push({
			rank,
			domain: normalizeDomain(item.domain),
			url: item.url ?? null,
			title: item.title ?? null,
		});
	}
	return out.sort((a, b) => a.rank - b.rank);
};

/**
 * BACKLOG #18: every distinct organic domain in the top-10 of the payload,
 * normalized (lowercase, no `www.`). Used by competitor-suggestion to tally
 * how often a domain shows up across a project's SERPs. Order matches the
 * SERP order so callers can short-circuit if needed; we only emit domains
 * with rank ≤ 10 and `type === 'organic'` (paid/snippet/people-also-ask are
 * not competitor signals).
 */
export const extractTop10Domains = (payload: SerpLiveResponse): readonly string[] => {
	const items = payload.tasks?.[0]?.result?.[0]?.items ?? [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of items) {
		if (item.type !== 'organic') continue;
		const rank = item.rank_absolute ?? item.rank_group;
		if (typeof rank !== 'number' || rank <= 0 || rank > 10) continue;
		if (!item.domain) continue;
		const key = normalizeDomain(item.domain);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(key);
	}
	return out;
};

const collectFeatures = (payload: SerpLiveResponse): readonly string[] => {
	const items = payload.tasks?.[0]?.result?.[0]?.items ?? [];
	const features = new Set<string>();
	for (const item of items) {
		if (item.type && item.type !== 'organic' && item.type !== 'featured_snippet') {
			features.add(item.type);
		}
	}
	return [...features];
};

const normalizeDomain = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/^www\./, '');
