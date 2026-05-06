import type { FetchContext } from '@rankpulse/provider-core';
import { BaseHttpClient, type HttpConfig, ProviderApiError } from '@rankpulse/provider-core';
import { buildBasicAuthHeader, parseCredential } from './credential.js';

/**
 * Hard cap on response body size. DataForSEO SERPs cap around 1MB; the
 * GSC search-analytics endpoint with rowLimit=25000 sits around 5-8MB.
 * 32MB leaves a generous margin for legitimate payloads while killing
 * runaway responses that would OOM the worker before the JSON parser
 * even returns.
 */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

const PROVIDER_ID = 'dataforseo';

/**
 * BaseHttpClient adapter for DataForSEO. The default `basic` AuthStrategy
 * in BaseHttpClient expects `username:password` as the plaintext secret and
 * base64-encodes it directly. DataForSEO instead persists `email|api_password`
 * (pipe-separated, because passwords can legally contain colons), so we
 * override `applyAuth` to convert the pipe form to the RFC 7617 colon form
 * before encoding.
 *
 * Used by the manifest path (Phase 5+). The legacy `DataForSeoHttp` class
 * below preserves the existing `fetchX(http, params, ctx)` signature for
 * the OLD `DataForSeoProvider`, which Phase 7 deletes.
 */
export class DataForSeoHttpClient extends BaseHttpClient {
	constructor(config: HttpConfig) {
		super(PROVIDER_ID, config);
	}

	protected override applyAuth(plaintextSecret: string): Record<string, string> {
		const creds = parseCredential(plaintextSecret);
		return {
			Authorization: buildBasicAuthHeader(creds),
			Accept: 'application/json',
		};
	}
}

export interface DataForSeoHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.dataforseo.com';

/**
 * Legacy POST wrapper used by the existing `fetchX` endpoint helpers and
 * the `DataForSeoProvider` class (deleted in Phase 7). Retained verbatim so
 * the OLD code path continues to work alongside the NEW manifest path.
 *
 * The body-size cap is provider-specific (DataForSEO returns very large
 * SERP-advanced payloads) and not yet covered by BaseHttpClient — keeping
 * it here until Phase 5 routes everything through `DataForSeoHttpClient`.
 */
export class DataForSeoHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: DataForSeoHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async post(
		path: string,
		body: unknown[],
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const creds = parseCredential(plaintextCredential);
		const url = `${this.baseUrl}${path}`;
		const response = await this.fetchImpl(url, {
			method: 'POST',
			headers: {
				Authorization: buildBasicAuthHeader(creds),
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(body),
			signal,
		});
		// Pre-flight: reject before buffering if the upstream advertises a
		// payload over the cap. `text()` would still buffer the whole
		// thing into RAM otherwise. Some upstreams omit Content-Length on
		// chunked responses, in which case we fall back to the post-read
		// guard below — best effort, but covers the common DDOS shape.
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`DataForSEO ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`DataForSEO ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				typeof parsed === 'string' ? parsed : text.slice(0, 4096),
				`DataForSEO ${path} returned HTTP ${response.status}`,
			);
		}
		return parsed;
	}
}

/**
 * Backward-compat alias. The old per-provider `DataForSeoApiError` class is
 * gone; consumers (worker processor's quota detector, package tests) still
 * import this name, so we re-export `ProviderApiError` under it. Phases 5/6
 * retire the worker code path; Phase 7 can drop this alias when no callers
 * remain.
 */
export const DataForSeoApiError = ProviderApiError;
export type DataForSeoApiError = ProviderApiError;

/**
 * DataForSEO returns HTTP 200 even when the task itself failed — the
 * real status lives in the body's `status_code`. Codes:
 *   - 20000          : task ok
 *   - 20100-20999    : informational (still success, no items)
 *   - 40000-49999    : client/auth/quota error
 *   - 50000-59999    : provider-side error
 *
 * Without this check the processor persists an empty payload as a
 * successful run AND charges the operator's ledger. Failure budget +
 * silent data loss.
 */
export const ensureTaskOk = (path: string, raw: { status_code: number; status_message: string }): void => {
	if (raw.status_code === 20000 || (raw.status_code >= 20100 && raw.status_code < 30000)) return;
	throw new ProviderApiError(
		PROVIDER_ID,
		raw.status_code,
		raw.status_message,
		`DataForSEO ${path} task error ${raw.status_code}: ${raw.status_message}`,
	);
};

/**
 * Adapter that lets the existing `fetchX(http, params, ctx)` helpers call
 * through `DataForSeoHttpClient` instead of `DataForSeoHttp`. The manifest
 * path uses this so a single `BaseHttpClient` instance handles auth,
 * timeouts and error wrapping; the helper still owns the body-size cap +
 * `ensureTaskOk` task-level error mapping.
 *
 * The shim accepts the legacy 4-arg signature (`path, body, plaintext,
 * signal`) but ignores the last two parameters — `BaseHttpClient` reads
 * the credential from `ctx.credential.plaintextSecret` via `applyAuth` and
 * composes the abort signal from `ctx.signal` itself.
 */
export const buildLegacyShim = (client: DataForSeoHttpClient, ctx: FetchContext): DataForSeoHttp =>
	({
		post: async (
			path: string,
			body: unknown[],
			_plaintextCredential: string,
			_signal?: AbortSignal,
		): Promise<unknown> => {
			// `BaseHttpClient.post` returns parsed JSON; for empty bodies it
			// returns `undefined`, which the legacy contract represents as
			// `null` in `DataForSeoHttp.post`. Normalise to keep `ensureTaskOk`
			// callers working.
			const parsed = await client.post<unknown>(path, {}, body, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as DataForSeoHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
