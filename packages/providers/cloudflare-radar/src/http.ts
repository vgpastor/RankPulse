/**
 * Cloudflare Radar API client. Auth = Bearer token in `Authorization` header.
 * The free tier is generous (1.2k req/5min/account) but we declare a tighter
 * 60 req/min in descriptors so a misconfigured cron can't drain it.
 */
import { validateCloudflareToken } from './credential.js';

export interface CloudflareRadarHttpOptions {
	baseUrl?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.cloudflare.com/client/v4';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class CloudflareRadarApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'CloudflareRadarApiError';
	}
}

export class CloudflareRadarHttp {
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: CloudflareRadarHttpOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async get(
		path: string,
		query: Record<string, string | string[]>,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const token = validateCloudflareToken(plaintextCredential);
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (Array.isArray(v)) for (const item of v) params.append(k, item);
			else params.append(k, v);
		}
		const url = `${this.baseUrl}${path}${params.size > 0 ? `?${params.toString()}` : ''}`;
		const response = await this.fetchImpl(url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
			signal,
		});
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new CloudflareRadarApiError(
				response.status,
				null,
				`Cloudflare ${path} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new CloudflareRadarApiError(
				response.status,
				null,
				`Cloudflare ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new CloudflareRadarApiError(
				response.status,
				parsed,
				`Cloudflare ${path} returned HTTP ${response.status}`,
			);
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
