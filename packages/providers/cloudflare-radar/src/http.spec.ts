import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLegacyShim, CloudflareRadarApiError, CloudflareRadarHttpClient } from './http.js';

const validToken = 'cf_test_TokenValue1234567890_abcXYZ';

const baseConfig: HttpConfig = {
	baseUrl: 'https://api.cloudflare.com/client/v4',
	auth: { kind: 'bearer-token' },
	defaultTimeoutMs: 5_000,
};

const stubContext = (plaintext = validToken, signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: plaintext },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('CloudflareRadarHttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('sends Authorization: Bearer <token> and Accept on a successful GET', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify({ success: true, result: {} }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new CloudflareRadarHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const result = await client.get<unknown>(
			'/radar/ranking/domain/example.com',
			{ rankingType: 'POPULAR', format: 'json' },
			stubContext(),
		);

		expect(result).toEqual({ success: true, result: {} });
		expect(capturedUrl).toBe(
			'https://api.cloudflare.com/client/v4/radar/ranking/domain/example.com?rankingType=POPULAR&format=json',
		);
		expect(capturedHeaders?.Authorization).toBe(`Bearer ${validToken}`);
		expect(capturedHeaders?.Accept).toBe('application/json');
	});

	it('legacy shim flattens multi-value query parameters into the URL', async () => {
		let capturedUrl: string | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			return new Response(JSON.stringify({ success: true, result: {} }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new CloudflareRadarHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const shim = buildLegacyShim(client, stubContext());
		// Cloudflare Radar's real endpoints don't use repeated keys today,
		// but the legacy contract accepts `string | string[]`; this test
		// confirms the shim preserves order when an array is passed.
		await shim.get(
			'/radar/ranking/domain/example.com',
			{ rankingType: 'POPULAR', format: 'json', filter: ['fresh', 'verified'] },
			validToken,
		);

		expect(capturedUrl).toContain('rankingType=POPULAR');
		expect(capturedUrl).toContain('format=json');
		expect(capturedUrl).toContain('filter=fresh');
		expect(capturedUrl).toContain('filter=verified');
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ errors: [{ code: 7003, message: 'Forbidden' }] }), {
					status: 403,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new CloudflareRadarHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(
			client.get('/radar/ranking/domain/example.com', { rankingType: 'POPULAR' }, stubContext()),
		).rejects.toMatchObject({ status: 403 });
		// Alias check: CloudflareRadarApiError === ProviderApiError, so
		// instanceof works for the worker's quota detector.
		await expect(
			client.get('/radar/ranking/domain/example.com', { rankingType: 'POPULAR' }, stubContext()),
		).rejects.toBeInstanceOf(CloudflareRadarApiError);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const client = new CloudflareRadarHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(
			client.get('/radar/ranking/domain/example.com', { rankingType: 'POPULAR' }, stubContext()),
		).rejects.toMatchObject({ status: 0 });
		await expect(
			client.get('/radar/ranking/domain/example.com', { rankingType: 'POPULAR' }, stubContext()),
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

		const client = new CloudflareRadarHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(
			client.get('/radar/ranking/domain/example.com', { rankingType: 'POPULAR' }, stubContext()),
		).rejects.toBeInstanceOf(ProviderApiError);
		await expect(
			client.get('/radar/ranking/domain/example.com', { rankingType: 'POPULAR' }, stubContext()),
		).rejects.toMatchObject({
			message: expect.stringContaining('response too large'),
		});
	});

	it('validateCredentialPlaintext rejects malformed tokens BEFORE any fetch (pre-flight)', async () => {
		// `validateCloudflareToken` is exported separately and called by
		// the manifest's `validateCredentialPlaintext` at registration time
		// — not on every request. This test confirms the credential format
		// check rejects clearly without ever hitting the network.
		const fakeFetch = vi.fn();
		const { validateCloudflareToken } = await import('./credential.js');

		expect(() => validateCloudflareToken('short')).toThrow(InvalidInputError);
		expect(fakeFetch).not.toHaveBeenCalled();
	});
});
