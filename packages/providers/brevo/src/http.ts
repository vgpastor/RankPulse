/**
 * Brevo REST API client. Auth = `api-key: <plaintext>` header (NOT Bearer).
 * Free tier is 300 emails/day; the rate-limit on read endpoints is generous
 * (~10 req/s per key). Descriptors declare a tighter 60 req/min so a
 * misconfigured cron can't drain the quota in a stuck retry loop.
 */
import { validateBrevoApiKey } from './credential.js';

export interface BrevoHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.brevo.com/v3';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class BrevoApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'BrevoApiError';
	}
}

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
			throw new BrevoApiError(
				response.status,
				null,
				`Brevo ${path} response too large: Content-Length ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new BrevoApiError(
				response.status,
				null,
				`Brevo ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new BrevoApiError(response.status, parsed, `Brevo ${path} returned HTTP ${response.status}`);
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
