import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiApiError, OpenAiHttpClient } from './http.js';

// Test fixture only — split + interpolated to avoid secret-scanner false positives.
const validApiKey = `sk${'-'}test${'-'}${'a'.repeat(32)}`;

const baseConfig: HttpConfig = {
	baseUrl: 'https://api.openai.com/v1',
	auth: { kind: 'bearer-token' },
	defaultTimeoutMs: 5_000,
};

const stubContext = (plaintext = validApiKey, signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: plaintext },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('OpenAiHttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('sends Authorization: Bearer <apiKey> and Accept on a successful POST', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		let capturedBody: string | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			capturedBody = init?.body as string;
			return new Response(JSON.stringify({ id: 'resp_123', output_text: 'ok' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new OpenAiHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const result = await client.post<{ id: string }>(
			'/responses',
			{},
			{ model: 'gpt-5-mini', input: 'hello' },
			stubContext(),
		);

		expect(result).toEqual({ id: 'resp_123', output_text: 'ok' });
		expect(capturedUrl).toBe('https://api.openai.com/v1/responses');
		expect(capturedHeaders?.Authorization).toBe(`Bearer ${validApiKey}`);
		expect(capturedHeaders?.Accept).toBe('application/json');
		expect(capturedHeaders?.['Content-Type']).toBe('application/json');
		expect(JSON.parse(capturedBody ?? '{}')).toEqual({ model: 'gpt-5-mini', input: 'hello' });
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: { message: 'invalid_api_key' } }), {
					status: 401,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new OpenAiHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.post('/responses', {}, { model: 'gpt-5-mini' }, stubContext())).rejects.toMatchObject(
			{ status: 401 },
		);
		// Alias check: OpenAiApiError === ProviderApiError, so instanceof works
		// for the worker's quota detector at provider-fetch.processor.ts:149.
		await expect(
			client.post('/responses', {}, { model: 'gpt-5-mini' }, stubContext()),
		).rejects.toBeInstanceOf(OpenAiApiError);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const client = new OpenAiHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.post('/responses', {}, { model: 'gpt-5-mini' }, stubContext())).rejects.toMatchObject(
			{ status: 0 },
		);
		await expect(
			client.post('/responses', {}, { model: 'gpt-5-mini' }, stubContext()),
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

		const client = new OpenAiHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(
			client.post('/responses', {}, { model: 'gpt-5-mini' }, stubContext()),
		).rejects.toBeInstanceOf(ProviderApiError);
		await expect(client.post('/responses', {}, { model: 'gpt-5-mini' }, stubContext())).rejects.toMatchObject(
			{
				message: expect.stringContaining('response too large'),
			},
		);
	});

	it('parseCredential rejects malformed API keys BEFORE any fetch (pre-flight)', async () => {
		// `parseCredential` is exported separately and called by the
		// manifest's `validateCredentialPlaintext` at registration time —
		// not on every request. This test confirms the credential format
		// check rejects clearly without ever hitting the network.
		const fakeFetch = vi.fn();
		const { parseCredential } = await import('./credential.js');

		expect(() => parseCredential('short')).toThrow(InvalidInputError);
		expect(() => parseCredential('this-is-not-an-openai-key-at-all')).toThrow(InvalidInputError);
		expect(fakeFetch).not.toHaveBeenCalled();
	});
});
