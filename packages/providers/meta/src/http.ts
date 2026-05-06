/**
 * Meta Graph / Marketing API client. Auth = `access_token` query param
 * (Bearer header is also accepted but FB's own examples and the Business
 * Use Case rate limiter both look at the query-param form).
 *
 * The Marketing API is free under the Business Use Case (BUC) rate limit
 * (~200 calls/hour per app per ad account). We declare a tighter
 * 60 req/min in descriptors so a misconfigured cron can't drain it.
 */
import { validateMetaAccessToken } from './credential.js';

export interface MetaHttpOptions {
	baseUrl?: string;
	apiVersion?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v21.0';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class MetaApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'MetaApiError';
	}
}

export class MetaHttp {
	private readonly baseUrl: string;
	private readonly apiVersion: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: MetaHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(
		path: string,
		query: Record<string, string | string[]>,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const token = validateMetaAccessToken(plaintextCredential);
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (Array.isArray(v)) for (const item of v) params.append(k, item);
			else params.append(k, v);
		}
		params.set('access_token', token);
		const url = `${this.baseUrl}/${this.apiVersion}${path}?${params.toString()}`;
		const response = await this.fetchImpl(url, {
			method: 'GET',
			headers: { Accept: 'application/json' },
			signal,
		});
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new MetaApiError(
				response.status,
				null,
				`Meta ${path} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new MetaApiError(
				response.status,
				null,
				`Meta ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new MetaApiError(response.status, parsed, `Meta ${path} returned HTTP ${response.status}`);
		}
		return parsed;
	}
}

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
