/**
 * Bing Webmaster Tools API client. Auth = single API key as `apikey` query
 * parameter. The service base is `ssl.bing.com/webmaster/api.svc/json/`.
 *
 * Bing rate limit is undocumented but generous (Microsoft says "fair use");
 * empirically a few hundred req/min/account work. We declare a conservative
 * 60 req/min in the descriptor so a misconfigured cron can't burn the
 * account.
 */
import { validateBingApiKey } from './credential.js';

export interface BingHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://ssl.bing.com/webmaster/api.svc/json';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class BingApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'BingApiError';
	}
}

export class BingHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: BingHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(
		method: string,
		query: Record<string, string>,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const apiKey = validateBingApiKey(plaintextCredential);
		const params = new URLSearchParams({ ...query, apikey: apiKey });
		const url = `${this.baseUrl}/${method}?${params.toString()}`;
		const response = await this.fetchImpl(url, {
			method: 'GET',
			headers: { Accept: 'application/json' },
			signal,
		});
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new BingApiError(
				response.status,
				null,
				`Bing ${method} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new BingApiError(
				response.status,
				null,
				`Bing ${method} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new BingApiError(response.status, parsed, `Bing ${method} returned HTTP ${response.status}`);
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
