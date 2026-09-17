import type { EndpointDescriptor } from '@rankpulse/provider-core';

/**
 * Narrows a job definition's params down to the subset that actually travels
 * to the upstream provider, so the request hash identifies the *upstream
 * call* rather than the job definition that triggered it.
 *
 * ## Why this exists
 *
 * `definition.params` mixes two kinds of data:
 *
 * - **Request params** — what gets serialized into the provider body.
 *   Declared by `descriptor.paramsSchema`. For `serp-google-organic-live`:
 *   `keyword`, `locationCode`, `languageCode`, `device`, `depth`.
 * - **Bookkeeping** — how RankPulse routes the response once it arrives:
 *   `projectId`, `organizationId`, `trackedKeywordId`, `domain`, …
 *
 * Hashing both means N definitions that produce a byte-identical provider
 * request still get N different hashes, so `findByRequestHash` never hits and
 * every one of them is billed. Measured on the PatrolTech org: the keyword
 * `software control de rondas` had 8 definitions differing *only* in `domain`
 * and `trackedKeywordId` — 8 identical POSTs to DataForSEO, 8 charges. Across
 * the org, 422 enabled definitions collapsed to 290 distinct upstream
 * requests: 31% of calls were redundant.
 *
 * Zod strips unknown keys by default, so parsing against `paramsSchema` yields
 * exactly the request params. It also applies `.default()`, which normalizes
 * an omitted optional and an explicitly-passed default to the same hash.
 *
 * The fan-out still works: on a cache hit the processor replays the payload
 * through `ingestRouter.dispatch({ definition, … })` with the *current*
 * definition, so each tracked keyword extracts its own domain's position from
 * the shared SERP response.
 *
 * ## Failure mode
 *
 * A params/schema mismatch falls back to the raw params — the pre-existing
 * behaviour. That over-fetches (the old bug) instead of risking a false cache
 * hit between two genuinely different requests, which would persist wrong data.
 */
export const deriveRequestIdentity = (
	descriptor: EndpointDescriptor,
	resolvedParams: Record<string, unknown>,
	log: { warn: (meta: object, msg: string) => void },
): Record<string, unknown> => {
	const parsed = descriptor.paramsSchema.safeParse(resolvedParams);
	if (parsed.success) {
		return parsed.data as Record<string, unknown>;
	}

	log.warn(
		{ endpointId: descriptor.id, issues: parsed.error.issues.map((i) => i.path.join('.')) },
		'params do not satisfy paramsSchema; hashing raw params (no dedup for this call)',
	);
	return resolvedParams;
};
