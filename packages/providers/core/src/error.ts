/**
 * Unified provider API error. Replaces the per-provider `<X>ApiError` classes
 * that proliferated as new providers were added (DataForSeoApiError,
 * BingApiError, OpenAiApiError, ClarityApiError, BrevoApiError, ...). The
 * `providerId` discriminant lets quota / retry logic do a single instanceof
 * check + status comparison instead of an N-way chain.
 *
 * `status === 0` is reserved for network / timeout / abort failures (no
 * upstream response).
 *
 * `body` is the upstream response body (truncated to ~4 KB by the HTTP
 * base) for diagnostics; may be undefined for network errors.
 */
export class ProviderApiError extends Error {
	readonly code = 'PROVIDER_API_ERROR' as const;

	constructor(
		readonly providerId: string,
		readonly status: number,
		readonly body: string | undefined,
		message: string,
	) {
		super(message);
		this.name = 'ProviderApiError';
	}
}

/**
 * Quota-exhausted = the upstream is telling us "no budget for now". Worker
 * auto-pauses the JobDefinition until the next billing window. Status 429
 * (rate limit) and 402 (payment required / over-quota) cover every provider
 * we integrate today; if a future provider needs a different status, expose
 * a per-manifest override hook (see ProviderManifest design doc).
 */
export function isQuotaExhaustedError(err: unknown): boolean {
	return err instanceof ProviderApiError && (err.status === 429 || err.status === 402);
}
