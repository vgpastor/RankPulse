/**
 * Wayback Machine CDX Server API client. The CDX API is unauthenticated;
 * we follow the Wikimedia/IA robot-policy convention of sending a
 * descriptive User-Agent so the Internet Archive ops team can contact us
 * if our usage pattern misbehaves.
 */
import type { FetchContext } from '@rankpulse/provider-core';
import {
	BaseHttpClient,
	type BaseHttpClientOptions,
	type HttpConfig,
	ProviderApiError,
} from '@rankpulse/provider-core';

const PROVIDER_ID = 'wayback';
const DEFAULT_USER_AGENT = 'RankPulse/1.0 (https://github.com/vgpastor/rankpulse; ops@rankpulse.local)';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RESPONSE_BODY_MAX_BYTES = 4_096;

/**
 * Compose two AbortSignals so the request aborts when either fires
 * (caller-provided cancellation + internal timeout).
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

export interface WaybackHttpClientOptions extends BaseHttpClientOptions {
	readonly userAgent?: string;
}

/**
 * BaseHttpClient adapter for the Wayback Machine CDX Server.
 *
 * The CDX API is unauthenticated; the manifest declares
 * `auth: { kind: 'custom', sign: noop }` so the registration flow stays
 * uniform with the other providers. `BaseHttpClient.applyAuth` throws for
 * `'custom'` strategies, so we override `request` directly to skip auth and
 * apply the User-Agent header on every request.
 */
export class WaybackHttpClient extends BaseHttpClient {
	private readonly userAgent: string;

	constructor(config: HttpConfig, options: WaybackHttpClientOptions = {}) {
		super(PROVIDER_ID, config, options);
		this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
	}

	protected override async request<T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		query: Record<string, string>,
		body: unknown,
		ctx: FetchContext,
	): Promise<T> {
		const url = this.buildUrl(path, query);

		const internalSignal = AbortSignal.timeout(this.config.defaultTimeoutMs ?? 60_000);
		const signal = composeSignals(ctx.signal, internalSignal);

		const headers: Record<string, string> = {
			'User-Agent': this.userAgent,
			Accept: 'application/json',
			'Accept-Encoding': 'gzip',
		};
		const init: RequestInit = { method, signal, headers };
		if (body !== undefined && (method === 'POST' || method === 'PUT')) {
			init.body = JSON.stringify(body);
			headers['Content-Type'] = 'application/json';
		}

		let response: Response;
		try {
			response = await (this.fetchImpl ?? globalThis.fetch)(url, init);
		} catch (err) {
			const message =
				err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
					? 'request aborted or timed out'
					: `network error: ${err instanceof Error ? err.message : String(err)}`;
			throw new ProviderApiError(PROVIDER_ID, 0, undefined, message);
		}

		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Wayback ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}

		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new ProviderApiError(
				PROVIDER_ID,
				response.status,
				undefined,
				`Wayback ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
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

		// Wayback returns an empty body when there are zero snapshots in the
		// requested window — treat that as an empty array, NOT a JSON error.
		if (text.length === 0) return [] as unknown as T;
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
