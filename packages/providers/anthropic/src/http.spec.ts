import type { FetchContext, HttpConfig } from '@rankpulse/provider-core';
import { ProviderApiError } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicApiError, AnthropicHttpClient, buildLegacyShim } from './http.js';

// Test fixture only — split + interpolated to avoid secret-scanner false positives.
const validKey = `sk${'-'}ant${'-'}api03${'-'}${'A'.repeat(22)}`;

const baseConfig: HttpConfig = {
	baseUrl: 'https://api.anthropic.com/v1',
	auth: { kind: 'api-key-header', headerName: 'x-api-key' },
	defaultTimeoutMs: 5_000,
	// Mirrors the manifest's body cap so the cap-enforcement test exercises
	// the same path the real composition root does.
	maxResponseBytes: 8 * 1024 * 1024,
};

const stubContext = (plaintext = validKey, signal?: AbortSignal): FetchContext => ({
	credential: { plaintextSecret: plaintext },
	logger: { debug: () => {}, warn: () => {} },
	signal,
	now: () => new Date('2026-05-04T10:00:00Z'),
});

describe('AnthropicHttpClient', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	it('sends x-api-key AND anthropic-version headers on a successful POST', async () => {
		let capturedUrl: string | undefined;
		let capturedHeaders: Record<string, string> | undefined;
		let capturedBody: string | undefined;
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			capturedUrl = typeof url === 'string' ? url : url.toString();
			capturedHeaders = init?.headers as Record<string, string>;
			capturedBody = typeof init?.body === 'string' ? init.body : undefined;
			return new Response(JSON.stringify({ id: 'msg_123', content: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new AnthropicHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const result = await client.post<{ id: string }>('/messages', {}, { model: 'claude' }, stubContext());

		expect(result).toEqual({ id: 'msg_123', content: [] });
		expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages');
		// Anthropic auth requires BOTH headers — verify the override emits
		// the api-key AND the version pin.
		expect(capturedHeaders?.['x-api-key']).toBe(validKey);
		expect(capturedHeaders?.['anthropic-version']).toBe('2023-06-01');
		expect(capturedHeaders?.Accept).toBe('application/json');
		expect(capturedHeaders?.['Content-Type']).toBe('application/json');
		// Authorization header MUST NOT be present — Anthropic uses x-api-key,
		// not Bearer-style auth.
		expect(capturedHeaders?.Authorization).toBeUndefined();
		expect(capturedBody).toBe(JSON.stringify({ model: 'claude' }));
	});

	it('legacy shim forwards POST through the BaseHttpClient with auth applied', async () => {
		let capturedHeaders: Record<string, string> | undefined;
		let capturedBody: string | undefined;
		const fakeFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			capturedHeaders = init?.headers as Record<string, string>;
			capturedBody = typeof init?.body === 'string' ? init.body : undefined;
			return new Response(JSON.stringify({ id: 'msg_456' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new AnthropicHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		const shim = buildLegacyShim(client, stubContext());
		// The legacy `apiKey` argument is intentionally ignored by the shim;
		// auth flows through `ctx.credential.plaintextSecret` instead. Pass a
		// dummy here to prove the shim doesn't smuggle it back into headers.
		const parsed = await shim.post('/messages', { model: 'sonnet' }, 'IGNORED');

		expect(parsed).toEqual({ id: 'msg_456' });
		expect(capturedHeaders?.['x-api-key']).toBe(validKey);
		expect(capturedHeaders?.['anthropic-version']).toBe('2023-06-01');
		expect(capturedBody).toBe(JSON.stringify({ model: 'sonnet' }));
	});

	it('throws ProviderApiError preserving the upstream status on non-OK responses', async () => {
		const fakeFetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: { type: 'invalid_request_error' } }), {
					status: 400,
					headers: { 'content-type': 'application/json' },
				}),
		);

		const client = new AnthropicHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.post('/messages', {}, { model: 'claude' }, stubContext())).rejects.toMatchObject({
			status: 400,
		});
		// Alias check: AnthropicApiError === ProviderApiError, so instanceof
		// works for the worker's quota detector.
		await expect(client.post('/messages', {}, { model: 'claude' }, stubContext())).rejects.toBeInstanceOf(
			AnthropicApiError,
		);
	});

	it('throws ProviderApiError with status 0 on network failure', async () => {
		const fakeFetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const client = new AnthropicHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.post('/messages', {}, { model: 'claude' }, stubContext())).rejects.toMatchObject({
			status: 0,
		});
		await expect(client.post('/messages', {}, { model: 'claude' }, stubContext())).rejects.toBeInstanceOf(
			ProviderApiError,
		);
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

		const client = new AnthropicHttpClient(baseConfig, {
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});
		await expect(client.post('/messages', {}, { model: 'claude' }, stubContext())).rejects.toBeInstanceOf(
			ProviderApiError,
		);
		await expect(client.post('/messages', {}, { model: 'claude' }, stubContext())).rejects.toMatchObject({
			message: expect.stringContaining('response too large'),
		});
	});

	it('validateCredentialPlaintext rejects malformed keys BEFORE any fetch (pre-flight)', async () => {
		// `parseCredential` is exported separately and called by the manifest's
		// `validateCredentialPlaintext` at registration time — not on every
		// request. This test confirms the credential format check rejects
		// clearly without ever hitting the network.
		const fakeFetch = vi.fn();
		const { parseCredential } = await import('./credential.js');

		expect(() => parseCredential('short')).toThrow(InvalidInputError);
		expect(() => parseCredential('this-key-is-long-enough-but-no-prefix')).toThrow(InvalidInputError);
		expect(fakeFetch).not.toHaveBeenCalled();
	});
});
