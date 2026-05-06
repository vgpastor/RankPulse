import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WikipediaHttpClient } from './http.js';

const baseConfig: HttpConfig = {
	baseUrl: 'https://wikimedia.org/api/rest_v1',
	auth: { kind: 'custom', sign: (req) => req },
	defaultTimeoutMs: 5_000,
};

const stubContext = (signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: 'public' },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('WikipediaHttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('sends User-Agent, Accept, and Accept-Encoding headers and no Authorization on a successful GET', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify({ items: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new WikipediaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const result = await client.get<{ items: unknown[] }>(
			'/metrics/pageviews/per-article/es.wikipedia.org/all-access/user/Torre_Eiffel/daily/20260101/20260131',
			{},
			stubContext(),
		);

		expect(result).toEqual({ items: [] });
		expect(capturedUrl).toBe(
			'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/es.wikipedia.org/all-access/user/Torre_Eiffel/daily/20260101/20260131',
		);
		expect(capturedHeaders?.['User-Agent']).toMatch(/RankPulse/);
		expect(capturedHeaders?.Accept).toBe('application/json');
		expect(capturedHeaders?.['Accept-Encoding']).toBe('gzip');
		// Wikimedia REST is unauthenticated — we must NEVER send an
		// Authorization header.
		expect(capturedHeaders?.Authorization).toBeUndefined();
	});

	it('honours a custom userAgent override', async () => {
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify({}), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new WikipediaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
			userAgent: 'CustomAgent/2.0 (test@example.com)',
		});
		await client.get('/path', {}, stubContext());
		expect(capturedHeaders?.['User-Agent']).toBe('CustomAgent/2.0 (test@example.com)');
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ detail: 'Not Found' }), {
					status: 404,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new WikipediaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.get('/missing', {}, stubContext())).rejects.toMatchObject({
			status: 404,
		});
		await expect(client.get('/missing', {}, stubContext())).rejects.toBeInstanceOf(ProviderApiError);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const client = new WikipediaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.get('/path', {}, stubContext())).rejects.toMatchObject({
			status: 0,
		});
		await expect(client.get('/path', {}, stubContext())).rejects.toBeInstanceOf(ProviderApiError);
	});

	it('throws ProviderApiError when Content-Length exceeds the 4MB cap', async () => {
		// 4MB + 1 byte → over the cap. We don't actually send 4MB of bytes,
		// the upstream just claims to in the header.
		const overCap = String(4 * 1024 * 1024 + 1);
		const fakeFetch = vi.fn(
			async () =>
				new Response('{}', {
					status: 200,
					headers: { 'content-type': 'application/json', 'content-length': overCap },
				}),
		);

		const client = new WikipediaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.get('/path', {}, stubContext())).rejects.toBeInstanceOf(ProviderApiError);
		await expect(client.get('/path', {}, stubContext())).rejects.toMatchObject({
			message: expect.stringContaining('response too large'),
		});
	});

	it('returns undefined for an empty response body without throwing', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response('', {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new WikipediaHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const result = await client.get('/path', {}, stubContext());
		expect(result).toBeUndefined();
	});
});
