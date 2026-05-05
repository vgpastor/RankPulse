import { JWT } from 'google-auth-library';
import { parseServiceAccount, type ServiceAccountKey } from './credential.js';

/**
 * Read-only scope for the Data API. `analytics.readonly` covers both core
 * reports and realtime; we never write so we don't request more.
 */
const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class Ga4ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'Ga4ApiError';
	}
}

/**
 * Service Account-authenticated client for the GA4 Data API. Each call
 * mints a fresh JWT-based access token via google-auth-library; the library
 * caches it internally until expiry.
 */
export class Ga4Http {
	private readonly fetchImpl: typeof fetch;

	constructor(options: { fetchImpl?: typeof fetch } = {}) {
		this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
	}

	async post(
		path: string,
		body: unknown,
		plaintextCredential: string,
		signal?: AbortSignal,
	): Promise<unknown> {
		const sa = parseServiceAccount(plaintextCredential);
		const jwt = this.buildJwt(sa);
		const tokenResponse = await jwt.authorize();
		if (!tokenResponse.access_token) {
			throw new Ga4ApiError(401, tokenResponse, 'Service account did not return an access_token');
		}
		const url = `https://analyticsdata.googleapis.com${path}`;
		const response = await this.fetchImpl(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tokenResponse.access_token}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(body),
			signal,
		});
		const contentLength = response.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
			throw new Ga4ApiError(
				response.status,
				null,
				`GA4 ${path} response too large: ${contentLength} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const text = await response.text();
		if (text.length > MAX_RESPONSE_BYTES) {
			throw new Ga4ApiError(
				response.status,
				null,
				`GA4 ${path} response too large: ${text.length} bytes (cap ${MAX_RESPONSE_BYTES})`,
			);
		}
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new Ga4ApiError(response.status, parsed, `GA4 ${path} returned HTTP ${response.status}`);
		}
		return parsed;
	}

	private buildJwt(sa: ServiceAccountKey): JWT {
		return new JWT({
			email: sa.client_email,
			key: sa.private_key,
			scopes: SCOPES,
		});
	}
}

const safeParse = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};
