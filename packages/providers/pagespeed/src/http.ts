/**
 * Google PageSpeed Insights v5 client. Supports two auth modes — API key
 * as a query param, or OAuth2 Bearer token from a service account.
 *
 * Free tier with API key: 1 req/sec, 25k/day per key.
 * SA OAuth: same daily quota, scoped per-project on Google Cloud.
 *
 * Both flows hit the same v5 endpoint; only the auth surface differs.
 * Pick the right one by inspecting the credential's plaintextSecret —
 * see `provider.ts` for the polymorphic dispatch.
 */

import type { FetchContext } from '@rankpulse/provider-core';
import { BaseHttpClient, type HttpConfig, ProviderApiError } from '@rankpulse/provider-core';
import { JWT } from 'google-auth-library';

export interface PageSpeedHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

export type PageSpeedAuth = { kind: 'apiKey'; apiKey: string } | { kind: 'bearer'; token: string };

const DEFAULT_BASE_URL = 'https://www.googleapis.com';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

const PROVIDER_ID = 'pagespeed';

/**
 * OAuth2 scope PSI accepts. The same `cloud-platform` scope works for any
 * Google API the SA has been authorized on; we keep it tight to PSI intent
 * so the SA's other privileges don't bleed in.
 */
const PSI_OAUTH_SCOPES = ['https://www.googleapis.com/auth/cloud-platform.read-only'];

/**
 * Bare API keys must look like one — Google issues at least 20 chars of
 * `[A-Za-z0-9_-]`. Pre-flight rejection here avoids wasting a request on a
 * mistyped credential and keeps the downstream error path uniform.
 */
const API_KEY_REGEX = /^[A-Za-z0-9_-]{20,}$/;

/**
 * Composes two AbortSignals so the request aborts when EITHER fires.
 * Caller-provided signal (job cancellation) + internal timeout signal.
 *
 * Duplicated from `BaseHttpClient` (where it's a private module-level helper)
 * because this client overrides `request` rather than `applyAuth`. See the
 * class header for the rationale.
 */
function composeSignals(...signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
	const real = signals.filter((s): s is AbortSignal => Boolean(s));
	const [first, second] = real;
	if (first && !second) return first;
	const controller = new AbortController();
	for (const s of real) {
		if (s.aborted) {
			controller.abort();
			return controller.signal;
		}
		s.addEventListener('abort', () => controller.abort(), { once: true });
	}
	return controller.signal;
}

/**
 * BaseHttpClient adapter for Google PageSpeed Insights.
 *
 * PSI is the most polymorphic auth case in the registry today: the
 * `plaintextSecret` is EITHER a Service Account JSON blob (in which case we
 * mint a short-lived OAuth2 access token via `google-auth-library` and pass
 * `Authorization: Bearer <token>`) OR a bare API key string (in which case
 * we append `?key=<key>` to the URL). The same registered credential can be
 * either shape — the adapter detects at request time.
 *
 * The default `BaseHttpClient.applyAuth` for `kind:
 * 'api-key-or-service-account-jwt'` THROWS — the strategy is declared at the
 * manifest level so the manifest stays self-documenting, but the actual
 * polymorphic dispatch needs an async step (the JWT mint) that the sync
 * `applyAuth` signature can't do. We override `request` here and handle
 * both branches inline — no call to `super.request` because the parent
 * would have already failed in `applyAuth` before this code ran.
 *
 * Used by the manifest path (Phase 5+). The legacy `PageSpeedHttp` class
 * below preserves the existing `fetchRunPagespeed(http: PageSpeedHttp,
 * params, auth, ctx)` signature for the OLD `PageSpeedProvider`, which
 * Phase 7 deletes.
 */
export class PageSpeedHttpClient extends BaseHttpClient {
	private readonly fetchImpl: typeof fetch;

	constructor(config: HttpConfig, options: { fetchImpl?: typeof fetch } = {}) {
		super(PROVIDER_ID, config);
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	protected override async request<T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<T> {
		const trimmed = ctx.credential.plaintextSecret.trim();
		const looksLikeJson = trimmed.startsWith('{');

		const headers: Record<string, string> = { Accept: 'application/json' };
		let url: string;

		if (looksLikeJson) {
			// Service Account JSON path — parse, mint Bearer token. The JSON
			// parse may throw (string starts with `{` but isn't valid JSON);
			// wrap as ProviderApiError so the worker treats it as an upstream
			// failure rather than leaking a SyntaxError.
			let parsed: { client_email?: unknown; private_key?: unknown };
			try {
				parsed = JSON.parse(trimmed) as { client_email?: unknown; private_key?: unknown };
			} catch (err) {
				throw new ProviderApiError(
					PROVIDER_ID,
					0,
					undefined,
					`PSI service account JSON is not valid: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
			if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
				throw new ProviderApiError(
					PROVIDER_ID,
					0,
					undefined,
					'PSI service account JSON missing client_email or private_key',
				);
			}
			const jwt = new JWT({
				email: parsed.client_email,
				key: parsed.private_key,
				scopes: PSI_OAUTH_SCOPES,
			});
			let token: string | null | undefined;
			try {
				const { token: minted } = await jwt.getAccessToken();
				token = minted;
			} catch (err) {
				throw new ProviderApiError(
					PROVIDER_ID,
					0,
					undefined,
					`google-auth-library token mint failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
			if (!token) {
				throw new ProviderApiError(
					PROVIDER_ID,
					401,
					undefined,
					'PSI service account did not return an access token',
				);
			}
			headers.Authorization = `Bearer ${token}`;
			url = this.buildUrl(path, query);
		} else {
			// Bare API key path — append as ?key=<key>. Reject mistyped keys
			// pre-flight so we don't waste a request on something that obviously
			// can't authenticate.
			if (!API_KEY_REGEX.test(trimmed)) {
				throw new ProviderApiError(
					PROVIDER_ID,
					0,
					undefined,
					'PSI credential must be Service Account JSON or 20+ char API key',
				);
			}
			url = this.buildUrl(path, { ...query, key: trimmed });
		}

		const internalSignal = AbortSignal.timeout(this.config.defaultTimeoutMs ?? 60_000);
		const signal = composeSignals(ctx.signal, internalSignal);

		const init: RequestInit = { method, signal, headers };
		if (body !== undefined && (method === 'POST' || method === 'PUT')) {
			init.body = JSON.stringify(body);
			headers['Content-Type'] = 'application/json';
		}

		let response: Response;
		try {
			response = await this.fetchImpl(url, init);
		} catch (err) {
			const message =
				err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
					? 'request aborted or timed out'
					: `network error: ${err instanceof Error ? err.message : String(err)}`;
			throw new ProviderApiError(PROVIDER_ID, 0, undefined, message);
		}

		// Best-effort early kill: if the upstream advertises Content-Length
		// over the cap, refuse before draining the body. Some responses are
		// chunked, in which case we fall back to the post-read guard below.
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`PSI ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`PSI ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		if (!response.ok) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`${PROVIDER_ID} ${method} ${path} → ${response.status}`,
			);
		}

		if (text.length === 0) return undefined as unknown as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`${PROVIDER_ID} ${method} ${path} → ${response.status} non-JSON body`,
			);
		}
	}
}

/**
 * Legacy GET wrapper used by the existing `fetchRunPagespeed(http:
 * PageSpeedHttp, ...)` helper and the `PageSpeedProvider` class (deleted in
 * Phase 7). Retained verbatim so the OLD code path continues to work
 * alongside the NEW manifest path.
 */
export class PageSpeedHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: PageSpeedHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(
		path: string,
		query: Record<string, string | string[]>,
		auth: PageSpeedAuth,
		signal?: AbortSignal,
	): Promise<unknown> {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (Array.isArray(v)) for (const item of v) params.append(k, item);
			else params.append(k, v);
		}
		// API key goes as ?key=... ; Bearer goes in the Authorization header.
		// PSI accepts either but never both — Google logs warnings if both
		// reach the same request.
		if (auth.kind === 'apiKey') params.append('key', auth.apiKey);
		const headers: Record<string, string> = { Accept: 'application/json' };
		if (auth.kind === 'bearer') headers.Authorization = `Bearer ${auth.token}`;
		const url = `${this.baseUrl}${path}?${params.toString()}`;
		const response = await this.fetchImpl(url, { method: 'GET', headers, signal });
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`PSI ${path} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`PSI ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				typeof parsed === 'string' ? parsed : text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`PSI ${path} returned HTTP ${response.status}`,
			);
		}
		return parsed;
	}
}

/**
 * Backward-compat alias. The old per-provider `PageSpeedApiError` class is
 * gone; consumers (worker processor's quota detector at
 * `apps/worker/src/processors/provider-fetch.processor.ts:128` does an
 * `instanceof PageSpeedApiError && (status === 402 || status === 429)`
 * check) still import this name, so we re-export `ProviderApiError` under
 * it. This preserves the `instanceof` check for both legacy AND new code
 * paths — `ProviderApiError` thrown by `PageSpeedHttpClient` will also
 * satisfy `instanceof PageSpeedApiError`. Phases 5/6 retire the worker
 * code path; Phase 7 can drop this alias when no callers remain.
 */
export const PageSpeedApiError = ProviderApiError;
export type PageSpeedApiError = ProviderApiError;

/**
 * Adapter that lets the existing `fetchRunPagespeed(http: PageSpeedHttp,
 * params, auth, ctx)` helper call through `PageSpeedHttpClient` instead of
 * `PageSpeedHttp`. The manifest path uses this so a single `BaseHttpClient`
 * instance handles auth, timeouts and error wrapping; the helper keeps its
 * current signature.
 *
 * The shim accepts the legacy 4-arg `PageSpeedHttp.get` signature but
 * IGNORES the `auth` argument — `PageSpeedHttpClient.request` resolves auth
 * from `ctx.credential.plaintextSecret` itself (polymorphic SA-JSON-vs-API-
 * key detection at request time). The legacy helper still passes a
 * resolved `auth` object only because its signature predates the new
 * client; the manifest's `adapt` closure threads a sentinel auth value
 * through that the shim ignores.
 *
 * The shim also flattens multi-value query parameters (PSI's `category`
 * comes in as `string[]`) into the path's query string before delegating
 * to `BaseHttpClient.get`, whose `query: Record<string, string>` type
 * cannot represent arrays. The empty-object query passed to the base
 * method keeps the URL builder a no-op for the query string.
 *
 * `BaseHttpClient.get` returns parsed JSON; for empty bodies it returns
 * `undefined`, which the legacy contract represents as `null` in
 * `PageSpeedHttp.get`. Normalise so callers see the same shape regardless
 * of which path produced the value.
 */
export const buildLegacyShim = (client: PageSpeedHttpClient, ctx: FetchContext): PageSpeedHttp =>
	({
		get: async (
			path: string,
			query: Record<string, string | string[]>,
			_auth: PageSpeedAuth,
			_signal?: AbortSignal,
		): Promise<unknown> => {
			const params = new URLSearchParams();
			for (const [k, v] of Object.entries(query)) {
				if (Array.isArray(v)) for (const item of v) params.append(k, item);
				else params.append(k, v);
			}
			const fullPath = params.size > 0 ? `${path}?${params.toString()}` : path;
			const parsed = await client.get<unknown>(fullPath, {}, ctx);
			return parsed === undefined ? null : parsed;
		},
	}) as PageSpeedHttp;

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
