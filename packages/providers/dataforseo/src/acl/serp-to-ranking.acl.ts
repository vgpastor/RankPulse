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
