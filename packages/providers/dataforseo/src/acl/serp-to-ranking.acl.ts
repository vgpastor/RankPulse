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
	const items = payload.tasks?.[0]?.result?.[0]?.items ?? [];
	const matchDomain = normalizeDomain(domain);
	const features = new Set<string>();
	let firstMatch: { position: number; url: string | null } | null = null;

	for (const item of items) {
		if (item.type && item.type !== 'organic' && item.type !== 'featured_snippet') {
			features.add(item.type);
		}
		if (!firstMatch) {
			const itemDomain = item.domain ? normalizeDomain(item.domain) : null;
			if (itemDomain && (itemDomain === matchDomain || itemDomain.endsWith(`.${matchDomain}`))) {
				const rank = item.rank_absolute ?? item.rank_group;
				if (typeof rank === 'number' && rank > 0) {
					firstMatch = { position: rank, url: item.url ?? null };
				}
			}
		}
	}

	return {
		position: firstMatch?.position ?? null,
		url: firstMatch?.url ?? null,
		serpFeatures: [...features],
	};
};

const normalizeDomain = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/^www\./, '');
