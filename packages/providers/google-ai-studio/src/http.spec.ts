import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAiStudioApiError, GoogleAiStudioHttpClient } from './http.js';

// Test fixture only — split + interpolated to avoid secret-scanner false positives.
const validApiKey = `${'A'.repeat(4)}${'x'.repeat(35)}`;

const baseConfig: HttpConfig = {
	baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
	auth: { kind: 'api-key-header', headerName: 'x-goog-api-key' },
	defaultTimeoutMs: 5_000,
	// Mirrors the manifest's body cap so the cap-enforcement test exercises
	// the same path the real composition root does.
	maxResponseBytes: 8 * 1024 * 1024,
};

const stubContext = (plaintext = validApiKey, signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: plaintext },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('GoogleAiStudioHttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('sends x-goog-api-key header (NOT Bearer) and Accept on a successful POST', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify({ candidates: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new GoogleAiStudioHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const result = await client.post<{ candidates: unknown[] }>(
			'/models/gemini-2.5-flash:generateContent',
			{},
			{ contents: [{ parts: [{ text: 'hi' }] }] },
			stubContext(),
		);

		expect(result).toEqual({ candidates: [] });
		expect(capturedUrl).toBe(
			'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
		);
		expect(capturedHeaders?.['x-goog-api-key']).toBe(validApiKey);
		expect(capturedHeaders?.Authorization).toBeUndefined();
		expect(capturedHeaders?.Accept).toBe('application/json');
		expect(capturedHeaders?.['Content-Type']).toBe('application/json');
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: { message: 'invalid key' } }), {
					status: 401,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new GoogleAiStudioHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.post('/models/x:generateContent', {}, {}, stubContext())).rejects.toMatchObject({
			status: 401,
		});
		await expect(client.post('/models/x:generateContent', {}, {}, stubContext())).rejects.toBeInstanceOf(
			GoogleAiStudioApiError,
		);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const client = new GoogleAiStudioHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.post('/models/x:generateContent', {}, {}, stubContext())).rejects.toMatchObject({
			status: 0,
		});
		await expect(client.post('/models/x:generateContent', {}, {}, stubContext())).rejects.toBeInstanceOf(
			ProviderApiError,
		);
	});

	it('throws ProviderApiError when Content-Length exceeds the 8MB cap', async () => {
		const overCap = String(8 * 1024 * 1024 + 1);
		const fakeFetch = vi.fn(
			async () =>
				new Response('{}', {
					status: 200,
					headers: { 'content-type': 'application/json', 'content-length': overCap },
				}),
		);

		const client = new GoogleAiStudioHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.post('/models/x:generateContent', {}, {}, stubContext())).rejects.toBeInstanceOf(
			ProviderApiError,
		);
		await expect(client.post('/models/x:generateContent', {}, {}, stubContext())).rejects.toMatchObject({
			message: expect.stringContaining('response too large'),
		});
	});

	it('parseCredential rejects malformed API keys BEFORE any fetch (pre-flight)', async () => {
		const fakeFetch = vi.fn();
		const { parseCredential } = await import('./credential.js');

		expect(() => parseCredential('short')).toThrow(InvalidInputError);
		expect(() => parseCredential('')).toThrow(InvalidInputError);
		expect(fakeFetch).not.toHaveBeenCalled();
	});
});
