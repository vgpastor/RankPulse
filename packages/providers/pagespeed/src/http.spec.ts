import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` calls are hoisted above ALL imports — so the SUT receives the
// mocked `JWT` constructor when it imports `google-auth-library`. Each test
// overrides `getAccessTokenImpl` to swap the `getAccessToken` behaviour
// without re-creating the mock constructor (which would lose the
// `new`-ability that arrow functions can't provide).
let getAccessTokenImpl: () => Promise<{ token?: string | null | undefined }> = async () => ({
	token: 'fake-access-token',
});

vi.mock('google-auth-library', () => {
	function JWT(this: object, _opts: unknown) {
		// Each fresh JWT instance reads the latest `getAccessTokenImpl` so the
		// outer test can swap it between calls without re-mocking.
		(this as { getAccessToken: () => Promise<unknown> }).getAccessToken = () => getAccessTokenImpl();
	}
	return { JWT };
});

import { buildLegacyShim, PageSpeedApiError, PageSpeedHttpClient } from './http.js';

// Test fixture only — split + interpolated to avoid secret-scanner false positives.
const validApiKey = `${'A'.repeat(4)}${'-'}${'a'.repeat(28)}`;

const validServiceAccountJson = JSON.stringify({
	type: 'service_account',
	project_id: 'rankpulse',
	client_email: 'svc@example.iam.gserviceaccount.com',
	private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
});

const baseConfig: HttpConfig = {
	baseUrl: 'https://www.googleapis.com',
	auth: { kind: 'api-key-or-service-account-jwt' },
	defaultTimeoutMs: 5_000,
};

const stubContext = (plaintext: string, signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: plaintext },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('PageSpeedHttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		// Reset the JWT mock so each test starts with the default getAccessToken.
		getAccessTokenImpl = async () => ({ token: 'fake-access-token' });
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('appends ?key=<key> to the URL on a bare-API-key credential and sends NO Authorization header', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify({ id: 'https://example.com/' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new PageSpeedHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		const result = await client.get<{ id: string }>(
			'/pagespeedonline/v5/runPagespeed',
			{ url: 'https://example.com', strategy: 'mobile' },
			stubContext(validApiKey),
		);

		expect(result).toEqual({ id: 'https://example.com/' });
		expect(capturedUrl).toContain('/pagespeedonline/v5/runPagespeed');
		expect(capturedUrl).toContain(`key=${validApiKey}`);
		expect(capturedUrl).toContain('strategy=mobile');
		// API-key path: NO Authorization header.
		expect(capturedHeaders?.Authorization).toBeUndefined();
		expect(capturedHeaders?.Accept).toBe('application/json');
	});

	it('mints a Bearer token on a Service Account JSON credential and sends NO ?key= in the URL', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify({ id: 'https://example.com/' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new PageSpeedHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		const result = await client.get<{ id: string }>(
			'/pagespeedonline/v5/runPagespeed',
			{ url: 'https://example.com', strategy: 'mobile' },
			stubContext(validServiceAccountJson),
		);

		expect(result).toEqual({ id: 'https://example.com/' });
		// SA-JSON path: Bearer header, no ?key=.
		expect(capturedHeaders?.Authorization).toBe('Bearer fake-access-token');
		expect(capturedUrl).not.toContain('key=');
		expect(capturedUrl).toContain('strategy=mobile');
	});

	it('legacy shim flattens multi-value query parameters (category) into the URL', async () => {
		let capturedUrl: string | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			return new Response(JSON.stringify({}), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new PageSpeedHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		const shim = buildLegacyShim(client, stubContext(validApiKey));
		await shim.get(
			'/pagespeedonline/v5/runPagespeed',
			{
				url: 'https://example.com',
				strategy: 'mobile',
				category: ['performance', 'seo'],
			},
			{ kind: 'apiKey', apiKey: 'IGNORED' },
		);

		// All three category values must round-trip through the URL — the
		// shim flattens the array before delegating to BaseHttpClient.get.
		expect(capturedUrl).toContain('category=performance');
		expect(capturedUrl).toContain('category=seo');
		expect(capturedUrl).toContain('strategy=mobile');
		// And ?key= comes from the credential, NOT from the ignored shim arg.
		expect(capturedUrl).toContain(`key=${validApiKey}`);
		expect(capturedUrl).not.toContain('key=IGNORED');
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: { message: 'Forbidden' } }), {
					status: 403,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new PageSpeedHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get(
				'/pagespeedonline/v5/runPagespeed',
				{ url: 'https://example.com' },
				stubContext(validApiKey),
			),
		).rejects.toMatchObject({ status: 403 });
		// Alias check: PageSpeedApiError === ProviderApiError, so instanceof works
		// for the worker's quota detector.
		await expect(
			client.get(
				'/pagespeedonline/v5/runPagespeed',
				{ url: 'https://example.com' },
				stubContext(validApiKey),
			),
		).rejects.toBeInstanceOf(PageSpeedApiError);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const client = new PageSpeedHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get(
				'/pagespeedonline/v5/runPagespeed',
				{ url: 'https://example.com' },
				stubContext(validApiKey),
			),
		).rejects.toMatchObject({ status: 0 });
		await expect(
			client.get(
				'/pagespeedonline/v5/runPagespeed',
				{ url: 'https://example.com' },
				stubContext(validApiKey),
			),
		).rejects.toBeInstanceOf(ProviderApiError);
	});

	it('throws ProviderApiError when Content-Length exceeds the 8MB cap', async () => {
		// 8MB + 1 byte → over the cap. We don't actually send 8MB of bytes,
		// the upstream just claims to in the header.
		const overCap = String(8 * 1024 * 1024 + 1);
		const fakeFetch = vi.fn(
			async () =>
				new Response('{}', {
					status: 200,
					headers: { 'content-type': 'application/json', 'content-length': overCap },
				}),
		);

		const client = new PageSpeedHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get(
				'/pagespeedonline/v5/runPagespeed',
				{ url: 'https://example.com' },
				stubContext(validApiKey),
			),
		).rejects.toBeInstanceOf(ProviderApiError);
		await expect(
			client.get(
				'/pagespeedonline/v5/runPagespeed',
				{ url: 'https://example.com' },
				stubContext(validApiKey),
			),
		).rejects.toMatchObject({
			message: expect.stringContaining('response too large'),
		});
	});

	it('throws ProviderApiError BEFORE fetch when SA JSON is missing client_email', async () => {
		// The credential parses as JSON but lacks the required SA fields. The
		// pre-flight check inside `request<T>` must reject without ever
		// hitting the network.
		const fakeFetch = vi.fn();
		const malformedSa = JSON.stringify({ private_key: 'pk-only' });

		const client = new PageSpeedHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get(
				'/pagespeedonline/v5/runPagespeed',
				{ url: 'https://example.com' },
				stubContext(malformedSa),
			),
		).rejects.toBeInstanceOf(ProviderApiError);
		await expect(
			client.get(
				'/pagespeedonline/v5/runPagespeed',
				{ url: 'https://example.com' },
				stubContext(malformedSa),
			),
		).rejects.toMatchObject({
			status: 0,
			message: expect.stringContaining('client_email'),
		});
		expect(fakeFetch).not.toHaveBeenCalled();
	});

	it('throws ProviderApiError BEFORE fetch when bare credential is too short to be an API key', async () => {
		const fakeFetch = vi.fn();

		const client = new PageSpeedHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get('/pagespeedonline/v5/runPagespeed', { url: 'https://example.com' }, stubContext('short')),
		).rejects.toBeInstanceOf(ProviderApiError);
		await expect(
			client.get('/pagespeedonline/v5/runPagespeed', { url: 'https://example.com' }, stubContext('short')),
		).rejects.toMatchObject({
			status: 0,
			message: expect.stringContaining('Service Account JSON or 20+ char API key'),
		});
		expect(fakeFetch).not.toHaveBeenCalled();
	});

	it('throws ProviderApiError BEFORE fetch when SA JSON is malformed (parse error)', async () => {
		// Starts with `{` but isn't valid JSON.
		const fakeFetch = vi.fn();
		const brokenJson = '{not valid json';

		const client = new PageSpeedHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get('/pagespeedonline/v5/runPagespeed', { url: 'https://example.com' }, stubContext(brokenJson)),
		).rejects.toBeInstanceOf(ProviderApiError);
		await expect(
			client.get('/pagespeedonline/v5/runPagespeed', { url: 'https://example.com' }, stubContext(brokenJson)),
		).rejects.toMatchObject({
			status: 0,
			message: expect.stringContaining('not valid'),
		});
		expect(fakeFetch).not.toHaveBeenCalled();
	});

	it('throws ProviderApiError(401) when the service account returns no access_token', async () => {
		getAccessTokenImpl = async () => ({ token: undefined });
		const fakeFetch = vi.fn();

		const client = new PageSpeedHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get(
				'/pagespeedonline/v5/runPagespeed',
				{ url: 'https://example.com' },
				stubContext(validServiceAccountJson),
			),
		).rejects.toMatchObject({ status: 401 });
		// fetch must NOT be called if the token mint failed.
		expect(fakeFetch).not.toHaveBeenCalled();
	});
});
