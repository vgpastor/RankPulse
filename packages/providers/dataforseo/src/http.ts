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
 * Shape of every DataForSEO response. Both the HTTP envelope AND each
 * individual task in `tasks[]` carry their own `status_code` — and the
 * envelope is misleading on its own (it reports 20000 whenever the HTTP
 * service is up, even when every task underneath failed with 4xxxx).
 */
export interface DataForSeoTaskStatus {
	readonly status_code: number;
	readonly status_message: string;
}

export interface DataForSeoResponseEnvelope extends DataForSeoTaskStatus {
	readonly tasks?: readonly DataForSeoTaskStatus[];
}

/**
 * DataForSEO status code ranges per their API spec:
 *   - 20000          : ok
 *   - 20100-29999    : informational (still success, e.g. "no items found")
 *   - 40000-49999    : client/auth/quota error
 *   - 50000-59999    : provider-side error
 */
const isDataForSeoSuccessStatus = (code: number): boolean =>
	code === 20000 || (code >= 20100 && code < 30000);

const raiseDataForSeoError = (
	path: string,
	level: 'envelope' | 'task',
	status: DataForSeoTaskStatus,
): never => {
	throw new ProviderApiError(
		PROVIDER_ID,
		status.status_code,
		status.status_message,
		`DataForSEO ${path} ${level} error ${status.status_code}: ${status.status_message}`,
	);
};

/**
 * Validates a DataForSEO response by checking BOTH the envelope and
 * every task within. The envelope alone is insufficient: subscription,
 * quota and per-target authorisation failures manifest as `20000` at the
 * envelope with `4xxxx` on the offending task. Without per-task checks
 * the processor persists an empty payload as a "succeeded" run AND
 * charges the operator's ledger — silent data loss compounded by
 * silent spend (issue #179).
 *
 * Throws on the first failing task; the rest are ignored. This matches
 * the existing contract for envelope-level failures: one error per call.
 */
export const ensureTaskOk = (path: string, raw: DataForSeoResponseEnvelope): void => {
	if (!isDataForSeoSuccessStatus(raw.status_code)) {
		raiseDataForSeoError(path, 'envelope', raw);
	}
	for (const task of raw.tasks ?? []) {
		if (!isDataForSeoSuccessStatus(task.status_code)) {
			raiseDataForSeoError(path, 'task', task);
		}
	}
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
