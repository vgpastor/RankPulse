import { ProviderApiError } from '@rankpulse/provider-core';

/**
 * What a DataForSEO status code is telling us, and therefore what the
 * scheduler should do about it.
 *
 * DataForSEO answers HTTP 200 with a five-digit `status_code` in the body
 * (envelope and per task), so the HTTP status alone says nothing. The codes
 * below come from `GET /v3/appendix/errors` on 2026-09-19; anything not
 * listed falls back to its thousand-block.
 *
 * Only `billing` should pause a schedule. A validation error pauses nothing:
 * it costs nothing upstream, and it recovers on its own the moment the
 * request shape is fixed — which is exactly how the `target1` fix (#218)
 * took effect without anyone touching 29 schedules.
 */
export type DataForSeoFailureKind =
	| 'billing' // no balance, cost cap, subscription, blocked account: stop until the operator acts
	| 'rate-limit' // per-minute or concurrency throttle: transient, retry
	| 'auth' // bad credential or unverified account: stop until the operator acts
	| 'validation' // we sent something the API rejects: fix the request, nothing to pause
	| 'not-found' // task/path/target unknown: fix the request, nothing to pause
	| 'no-results' // the search engine had nothing: an empty answer, not a failure
	| 'upstream' // DataForSEO or the search engine hiccuped: transient, retry
	| 'unknown';

const BILLING = new Set([40200, 40201, 40203, 40204, 40205, 40206, 40207, 40208, 40210]);
const RATE_LIMIT = new Set([40202, 40209]);
const AUTH = new Set([40100, 40104]);
const UPSTREAM = new Set([40101, 40103, 40106, 50000, 50001]);
const NO_RESULTS = new Set([40102]);

export const classifyDataForSeoStatus = (status: number): DataForSeoFailureKind => {
	if (BILLING.has(status)) return 'billing';
	if (RATE_LIMIT.has(status)) return 'rate-limit';
	if (AUTH.has(status)) return 'auth';
	if (UPSTREAM.has(status)) return 'upstream';
	if (NO_RESULTS.has(status)) return 'no-results';
	// HTTP-level statuses surface here too when the body never arrived.
	if (status === 402) return 'billing';
	if (status === 429) return 'rate-limit';
	if (status === 401 || status === 403) return 'auth';
	if (status >= 500 && status < 600) return 'upstream';
	// Unlisted five-digit codes: the thousand-block is still meaningful.
	if (status >= 40200 && status < 40300) return 'billing';
	if (status >= 40100 && status < 40200) return 'auth';
	if (status >= 40400 && status < 40500) return 'not-found';
	if (status >= 40000 && status < 40100) return 'validation';
	if (status >= 40500 && status < 40600) return 'validation';
	if (status >= 50000) return 'upstream';
	return 'unknown';
};

/**
 * The manifest's `isQuotaExhausted` hook. True only for failures that no
 * retry and no code change can clear — the operator has to top up, raise a
 * cap, or fix the account. Everything else keeps its schedule.
 */
export const isDataForSeoQuotaExhausted = (error: unknown): boolean =>
	error instanceof ProviderApiError &&
	error.providerId === 'dataforseo' &&
	classifyDataForSeoStatus(error.status) === 'billing';
