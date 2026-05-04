import { JWT } from 'google-auth-library';
import { parseServiceAccount, type ServiceAccountKey } from './credential.js';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

export class GscApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = 'GscApiError';
	}
}

/**
 * Service Account-authenticated client for the Search Console API. Each call
 * mints a fresh JWT-based access token via google-auth-library; the library
 * caches it internally until expiry.
 */
export class GscHttp {
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
			throw new GscApiError(401, tokenResponse, 'Service account did not return an access_token');
		}
		const url = `https://searchconsole.googleapis.com${path}`;
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
		const text = await response.text();
		const parsed = text.length > 0 ? safeParse(text) : null;
		if (!response.ok) {
			throw new GscApiError(response.status, parsed, `GSC ${path} returned HTTP ${response.status}`);
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
