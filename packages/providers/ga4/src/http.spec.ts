import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` calls are hoisted above ALL imports — so the SUT receives the
// mocked `JWT` constructor when it imports `google-auth-library`. Each test
// overrides `authorizeImpl` to swap the `authorize` behaviour without
// re-creating the mock constructor (which would lose the `new`-ability that
// arrow functions can't provide).
let authorizeImpl: () => Promise<{ access_token?: string | null | undefined }> = async () => ({
	access_token: 'fake-access-token',
});

vi.mock('google-auth-library', () => {
	function JWT(this: object, _opts: unknown) {
		// Each fresh JWT instance reads the latest `authorizeImpl` so the
		// outer test can swap it between calls without re-mocking.
		(this as { authorize: () => Promise<unknown> }).authorize = () => authorizeImpl();
	}
	return { JWT };
});

import { Ga4ApiError, Ga4HttpClient } from './http.js';

const validServiceAccountJson = JSON.stringify({
	type: 'service_account',
	project_id: 'rankpulse',
	client_email: 'svc@example.iam.gserviceaccount.com',
	private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
});

const baseConfig: HttpConfig = {
	baseUrl: 'https://analyticsdata.googleapis.com',
	auth: { kind: 'service-account-jwt' },
	defaultTimeoutMs: 5_000,
};

const stubContext = (signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: validServiceAccountJson },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('Ga4HttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		// Reset the JWT mock so each test starts with the default authorize.
		authorizeImpl = async () => ({ access_token: 'fake-access-token' });
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('mints a token and sends the bearer header on a successful POST', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify({ rows: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});
		globalThis.fetch = fakeFetch as unknown as typeof fetch;

		const client = new Ga4HttpClient(baseConfig);
		const result = await client.post<{ rows: unknown[] }>('/path', {}, { foo: 'bar' }, stubContext());

		expect(result).toEqual({ rows: [] });
		expect(capturedUrl).toContain('analyticsdata.googleapis.com');
		expect(capturedHeaders?.Authorization).toBe('Bearer fake-access-token');
		expect(capturedHeaders?.['Content-Type']).toBe('application/json');
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: { message: 'Forbidden' } }), {
					status: 403,
					headers: { 'content-type': 'application/json' },
				}),
		);
		globalThis.fetch = fakeFetch as unknown as typeof fetch;

		const client = new Ga4HttpClient(baseConfig);
		await expect(client.post('/forbidden', {}, {}, stubContext())).rejects.toMatchObject({
			status: 403,
		});
		// Alias check: Ga4ApiError === ProviderApiError, so instanceof works.
		await expect(client.post('/forbidden', {}, {}, stubContext())).rejects.toBeInstanceOf(Ga4ApiError);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});
		globalThis.fetch = fakeFetch as unknown as typeof fetch;

		const client = new Ga4HttpClient(baseConfig);
		await expect(client.post('/x', {}, {}, stubContext())).rejects.toMatchObject({
			status: 0,
		});
		await expect(client.post('/x', {}, {}, stubContext())).rejects.toBeInstanceOf(ProviderApiError);
	});

	it('throws ProviderApiError(401) when the service account returns no access_token', async () => {
		authorizeImpl = async () => ({ access_token: undefined });
		const fakeFetch = vi.fn();
		globalThis.fetch = fakeFetch as unknown as typeof fetch;

		const client = new Ga4HttpClient(baseConfig);
		await expect(client.post('/x', {}, {}, stubContext())).rejects.toMatchObject({
			status: 401,
		});
		// fetch must NOT be called if the token mint failed.
		expect(fakeFetch).not.toHaveBeenCalled();
	});

	it('throws ProviderApiError(0) when google-auth-library itself fails', async () => {
		authorizeImpl = async () => {
			throw new Error('PEM parse error');
		};
		const client = new Ga4HttpClient(baseConfig);
		await expect(client.post('/x', {}, {}, stubContext())).rejects.toMatchObject({
			status: 0,
		});
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
		globalThis.fetch = fakeFetch as unknown as typeof fetch;

		const client = new Ga4HttpClient(baseConfig);
		await expect(client.post('/big', {}, {}, stubContext())).rejects.toBeInstanceOf(ProviderApiError);
		await expect(client.post('/big', {}, {}, stubContext())).rejects.toMatchObject({
			message: expect.stringContaining('response too large'),
		});
	});
});
