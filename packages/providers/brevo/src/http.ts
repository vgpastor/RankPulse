/**
 * Brevo REST API client. Auth = `api-key: <plaintext>` header (NOT Bearer).
 * Free tier is 300 emails/day; the rate-limit on read endpoints is generous
 * (~10 req/s per key). Descriptors declare a tighter 60 req/min so a
 * misconfigured cron can't drain the quota in a stuck retry loop.
 */
import type { FetchContext } from '@rankpulse/provider-core';
import {
	BaseHttpClient,
	type BaseHttpClientOptions,
	type HttpConfig,
	ProviderApiError,
} from '@rankpulse/provider-core';
import { validateBrevoApiKey } from './credential.js';

export interface BrevoHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.brevo.com/v3';
/**
 * Cap on response body. Brevo email-stats responses are typically <1MB;
 * 8MB is a generous safety net for `/contacts/{id}` payloads with long
 * event histories. Lives on `manifest.http.maxResponseBytes`; kept here
 * as a constant so the legacy `BrevoHttp` path (below) enforces the
 * same cap.
 */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'brevo';

/**
 * BaseHttpClient adapter for Brevo (Sendinblue) REST API v3.
 *
 * Auth is the simplest non-Bearer case: a single API key applied as
 * `api-key: <plaintext>` (NOT `Authorization: Bearer ...`). The default
 * `BaseHttpClient.applyAuth` for `kind: 'api-key-header'` already produces
 * exactly that header, so no override is needed.
 *
 * Body capping (8MB) lives on `manifest.http.maxResponseBytes`; the
 * base client enforces it via Content-Length pre-flight + post-read
 * guard, so this class no longer needs a `request<T>` override.
 *
 * Used by the manifest path (Phase 5+). The legacy `BrevoHttp` class
 * below preserves the existing `fetch<X>(http: BrevoHttp, ...)` signature
 * for the OLD `BrevoProvider`, which Phase 7 deletes.
 */
export class BrevoHttpClient extends BaseHttpClient {
	constructor(config: HttpConfig, options: BaseHttpClientOptions = {}) {
		super(PROVIDER_ID, config, options);
	}
}

/**
 * Legacy GET wrapper used by the existing `fetch<X>(http: BrevoHttp, ...)`
 * helpers and the `BrevoProvider` class (deleted in Phase 7). Retained
 * verbatim so the OLD code path continues to work alongside the NEW
 * manifest path.
 */
export class BrevoHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: BrevoHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(
		path: string,
		query: Record<string, string | string[] | undefined>,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const apiKey = validateBrevoApiKey(plaintextCredential);
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (v === undefined) continue;
			if (Array.isArray(v)) for (const item of v) params.append(k, item);
			else params.append(k, v);
		}
		const url = `${this.baseUrl}${path}${params.size > 0 ? `?${params.toString()}` : ''}`;
		const response = await this.fetchImpl(url, {
			method: 'GET',
			headers: {
				'api-key': apiKey,
				Accept: 'application/json',
			},
			signal,
		});
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Brevo ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Brevo ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				typeof parsed === 'string' ? parsed : text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`Brevo ${path} returned HTTP ${response.status}`,
			);
		}
		return parsed;
	}
}

/**
 * Backward-compat alias. The old per-provider `BrevoApiError` class is
 * gone; consumers (callers using `instanceof BrevoApiError` to discriminate
 * provider failures) still import this name, so we re-export
 * `ProviderApiError` under it. This preserves the `instanceof` check for
 * both legacy AND new code paths — `ProviderApiError` thrown by
 * `BrevoHttpClient` will also satisfy `instanceof BrevoApiError`. Phases
 * 5/6 retire the legacy code path; Phase 7 can drop this alias when no
 * callers remain.
 */
export const BrevoApiError = ProviderApiError;
export type BrevoApiError = ProviderApiError;

/**
 * Adapter that lets the existing `fetch<X>(http: BrevoHttp, ...)` helpers
 * call through `BrevoHttpClient` instead of `BrevoHttp`. The manifest path
 * uses this so a single `BaseHttpClient` instance handles auth, timeouts
 * and error wrapping; the helpers keep their current signature.
 *
 * The shim flattens query-shape variations (Brevo's helpers pass
 * `Record<string, string | string[] | undefined>` — undefined values must
 * be SKIPPED, otherwise `URLSearchParams` would serialize them as the
 * literal string `"undefined"`) into the path's query string before
 * calling `BaseHttpClient.get`, whose `query: Record<string, string>`
 * parameter cannot represent arrays nor undefined.
 *
 * `BaseHttpClient.get` returns parsed JSON; for empty bodies it returns
 * `undefined`, which the legacy contract represents as `null` in
 * `BrevoHttp.get`. Normalise so callers see the same shape regardless
 * of which path produced the value.
 */
export const buildLegacyShim = (client: BrevoHttpClient, ctx: FetchContext): BrevoHttp =>
	({
		get: async (
			path: string,
			query: Record<string, string | string[] | undefined>,
			_plaintextCredential: string,
			_signal?: AbortSignal,
		): Promise<unknown> => {
			const params = new URLSearchParams();
			for (const [k, v] of Object.entries(query)) {
				if (v === undefined) continue;
				if (Array.isArray(v)) for (const item of v) params.append(k, item);
				else params.append(k, v);
			}
			const fullPath = params.size > 0 ? `${path}?${params.toString()}` : path;
			const parsed = await client.get<unknown>(fullPath, {}, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as BrevoHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
