import type { ProjectManagement, RankTracking } from '@rankpulse/domain';
import {
	extractRankingsForDomains,
	type SerpLiveResponse,
	type SerpRankingExtraction,
} from '@rankpulse/provider-dataforseo';

export interface MultiDomainExtraction {
	trackedKeywordId: RankTracking.TrackedKeywordId;
	domain: string;
	extraction: SerpRankingExtraction;
}

const normalize = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/^www\./, '');

/**
 * BACKLOG #15 — fans a single SERP payload into one extraction per tracked
 * keyword that shares the same SERP query. The processor used to do
 * 1 fetch = 1 observation; now does 1 fetch = N observations (one per
 * domain in the project that's being tracked for this keyword).
 *
 * Dedup by domain key: if two tracked_keyword rows happen to point at the
 * same normalized domain (e.g. `Foo.com` and `www.foo.com`) we only emit
 * one observation, attributed to the first tracked_keyword found. The
 * scheduling layer should already prevent that, but the processor is
 * defensive — observation idempotency is keyed on `(tracked_keyword,
 * raw_payload)` so a double-emit would fail the unique index later.
 *
 * Pure function: no I/O, no clock, no logging — testable end-to-end with
 * just a fixture payload + a list of TrackedKeyword aggregates. Mocks
 * stay at the use-case boundary in the processor.
 */
export const extractMultiDomainRankings = (
	payload: SerpLiveResponse,
	trackedKeywords: readonly RankTracking.TrackedKeyword[],
): MultiDomainExtraction[] => {
	if (trackedKeywords.length === 0) return [];

	const byNormalized = new Map<string, RankTracking.TrackedKeyword>();
	for (const tk of trackedKeywords) {
		const key = normalize(tk.domain.value);
		// First-write-wins dedup — guards the "same domain in two tracked_keyword
		// rows" edge case described above.
		if (!byNormalized.has(key)) byNormalized.set(key, tk);
	}
	const targets = [...byNormalized.keys()];
	const extractions = extractRankingsForDomains(payload, targets);

	const out: MultiDomainExtraction[] = [];
	for (const [key, tk] of byNormalized) {
		const extraction = extractions.get(key);
		if (!extraction) continue; // shouldn't happen — extractRankingsForDomains always returns the target
		out.push({ trackedKeywordId: tk.id, domain: tk.domain.value, extraction });
	}
	return out;
};

/**
 * Lightweight predicate exposed for the processor to short-circuit when
 * the job's params don't match the SERP fan-out shape. Centralised so the
 * `(projectId + phrase + country + language + device)` contract stays in
 * one place.
 */
export const isMultiDomainSerpJob = (params: {
	projectId?: string;
	phrase?: string;
	country?: string;
	language?: string;
	device?: string;
}): params is {
	projectId: ProjectManagement.ProjectId;
	phrase: string;
	country: string;
	language: string;
	device: string;
} =>
	typeof params.projectId === 'string' &&
	typeof params.phrase === 'string' &&
	typeof params.country === 'string' &&
	typeof params.language === 'string' &&
	typeof params.device === 'string';
