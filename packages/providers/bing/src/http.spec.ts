import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BingApiError, BingHttpClient } from './http.js';

// Test fixture only — split + interpolated to avoid secret-scanner false positives.
const validApiKey = `${'A'.repeat(8)}${'B'.repeat(8)}${'C'.repeat(8)}${'D'.repeat(8)}`;

const baseConfig: HttpConfig = {
	baseUrl: 'https://ssl.bing.com/webmaster/api.svc/json',
	auth: { kind: 'custom', sign: (req) => req },
	defaultTimeoutMs: 5_000,
};

const stubContext = (plaintext = validApiKey, signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: plaintext },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('BingHttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('appends apikey to the URL on a successful GET', async () => {
		let capturedUrl: string | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			return new Response(JSON.stringify({ d: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new BingHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		const result = await client.get<{ d: unknown[] }>(
			'/GetRankAndTrafficStats',
			{ siteUrl: 'https://example.com/' },
			stubContext(),
		);

		expect(result).toEqual({ d: [] });
		expect(capturedUrl).toContain('ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats');
		expect(capturedUrl).toContain(`apikey=${validApiKey}`);
		expect(capturedUrl).toContain('siteUrl=');
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ Message: 'Forbidden' }), {
					status: 403,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new BingHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get('/GetRankAndTrafficStats', { siteUrl: 'https://example.com/' }, stubContext()),
		).rejects.toMatchObject({
			status: 403,
		});
		// Alias check: BingApiError === ProviderApiError, so instanceof works.
		await expect(
			client.get('/GetRankAndTrafficStats', { siteUrl: 'https://example.com/' }, stubContext()),
		).rejects.toBeInstanceOf(BingApiError);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const client = new BingHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get('/GetRankAndTrafficStats', { siteUrl: 'https://example.com/' }, stubContext()),
		).rejects.toMatchObject({
			status: 0,
		});
		await expect(
			client.get('/GetRankAndTrafficStats', { siteUrl: 'https://example.com/' }, stubContext()),
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

		const client = new BingHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get('/GetRankAndTrafficStats', { siteUrl: 'https://example.com/' }, stubContext()),
		).rejects.toBeInstanceOf(ProviderApiError);
		await expect(
			client.get('/GetRankAndTrafficStats', { siteUrl: 'https://example.com/' }, stubContext()),
		).rejects.toMatchObject({
			message: expect.stringContaining('response too large'),
		});
	});

	it('throws InvalidInputError BEFORE fetch when the API key is malformed', async () => {
		const fakeFetch = vi.fn();

		const client = new BingHttpClient(baseConfig, { fetchImpl: fakeFetch as unknown as typeof fetch });
		await expect(
			client.get('/GetRankAndTrafficStats', { siteUrl: 'https://example.com/' }, stubContext('short')),
		).rejects.toBeInstanceOf(InvalidInputError);
		// fetch must NOT be called if the key validation failed.
		expect(fakeFetch).not.toHaveBeenCalled();
	});
});
