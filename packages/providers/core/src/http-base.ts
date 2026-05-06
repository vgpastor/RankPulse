import { ProviderApiError } from './error.js';
import type { AuthStrategy, HttpClient, HttpConfig } from './manifest.js';
import type { FetchContext } from './types.js';

const RESPONSE_BODY_MAX_BYTES = 4_096;

/**
 * Composes two AbortSignals so the request aborts when EITHER fires.
 * Caller-provided signal (job cancellation) + internal timeout signal.
 */
function composeSignals(...signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
	const real = signals.filter((s): s is AbortSignal => Boolean(s));
	if (real.length === 1) return real[0]!;
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
 * Shared HTTP base for all provider adapters. Handles:
 *  - Auth header application (via the AuthStrategy enum or subclass override).
 *  - Internal timeout + caller-signal composition.
 *  - Error wrapping into ProviderApiError (status 0 = network / timeout).
 *  - Response body capping (4 KB max in the error payload).
 *  - JSON parse fallback (raises ProviderApiError if body isn't JSON).
 *
 * Subclasses override `applyAuth` and `buildUrl` for provider-specific
 * concerns. The default `applyAuth` selects on AuthStrategy.kind for the
 * common cases (bearer, api-key-header, basic). Custom strategies provide
 * their own `sign(req, secret)` function or override the method.
 */
export abstract class BaseHttpClient implements HttpClient {
	constructor(
		protected readonly providerId: string,
		protected readonly config: HttpConfig,
	) {}

	get<T>(path: string, query: Record<string, string>, ctx: FetchContext): Promise<T> {
		return this.request<T>('GET', path, query, undefined, ctx);
	}

	post<T>(
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<T> {
		return this.request<T>('POST', path, query, body, ctx);
	}

	put<T>(
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<T> {
		return this.request<T>('PUT', path, query, body, ctx);
	}

	delete<T>(path: string, query: Record<string, string>, ctx: FetchContext): Promise<T> {
		return this.request<T>('DELETE', path, query, undefined, ctx);
	}

	protected async request<T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<T> {
		const url = this.buildUrl(path, query);
		const internalSignal = AbortSignal.timeout(this.config.defaultTimeoutMs ?? 60_000);
		const signal = composeSignals(ctx.signal, internalSignal);

		const headers = this.applyAuth(ctx.credential.plaintextSecret, body);
		const init: RequestInit = { method, signal, headers };
		if (body !== undefined && (method === 'POST' || method === 'PUT')) {
			init.body = JSON.stringify(body);
			(init.headers as Record<string, string>)['Content-Type'] = 'application/json';
		}

		let response: Response;
		try {
			response = await fetch(url, init);
		} catch (err) {
			const message =
				err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
					? 'request aborted or timed out'
					: `network error: ${err instanceof Error ? err.message : String(err)}`;
			throw new ProviderApiError(this.providerId, 0, undefined, message);
		}

		if (!response.ok) {
			const text = await this.safeText(response);
			throw new ProviderApiError(
				this.providerId,
				response.status,
				text,
				`${this.providerId} ${method} ${path} → ${response.status}`,
			);
		}

		return this.parseResponse<T>(response, method, path);
	}

	protected async parseResponse<T>(response: Response, method: string, path: string): Promise<T> {
		const text = await response.text();
		// 204 No Content + 200 with empty body are both legitimate "no payload"
		// signals from upstreams; returning undefined is safer than throwing.
		if (text.length === 0) return undefined as unknown as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new ProviderApiError(
				this.providerId,
				response.status,
				text.slice(0, RESPONSE_BODY_MAX_BYTES),
				`${this.providerId} ${method} ${path} → ${response.status} non-JSON body`,
			);
		}
	}

	protected async safeText(response: Response): Promise<string> {
		// Reading an aborted/closed body would throw; swallow so we can still
		// build a useful ProviderApiError with the status alone.
		try {
			const text = await response.text();
			return text.slice(0, RESPONSE_BODY_MAX_BYTES);
		} catch {
			return '';
		}
	}

	/**
	 * Default auth-header application based on the manifest's AuthStrategy.
	 * Subclasses may override for non-standard cases (e.g. DataForSEO basic
	 * with username:password split, GSC service-account JWT exchange).
	 */
	protected applyAuth(plaintextSecret: string, _body: unknown): Record<string, string> {
		const auth: AuthStrategy = this.config.auth;
		switch (auth.kind) {
			case 'bearer-token':
				return { Authorization: `Bearer ${plaintextSecret}` };
			case 'api-key-header':
				return { [auth.headerName]: plaintextSecret };
			case 'oauth-token':
				return { Authorization: `Bearer ${plaintextSecret}` };
			case 'basic': {
				// plaintextSecret format: "username:password"
				const b64 = Buffer.from(plaintextSecret).toString('base64');
				return { Authorization: `Basic ${b64}` };
			}
			case 'service-account-jwt':
			case 'api-key-or-service-account-jwt':
			case 'custom':
				throw new Error(
					`AuthStrategy '${auth.kind}' requires the provider to override applyAuth(). Did you forget?`,
				);
		}
	}

	/**
	 * Default URL builder. Subclasses with non-trivial URL construction
	 * (e.g. dynamic API versioning) override this.
	 */
	protected buildUrl(path: string, query: Record<string, string>): string {
		const qs = new URLSearchParams(query).toString();
		return `${this.config.baseUrl}${path}${qs ? `?${qs}` : ''}`;
	}
}
