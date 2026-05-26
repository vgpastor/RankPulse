import type { FetchContext } from '@rankpulse/provider-core';
import { describe, expect, it } from 'vitest';
import type { AnthropicHttp } from '../http.js';
import { fetchMessagesWithWebSearch, type MessagesWithWebSearchParams } from './messages-with-web-search.js';

// Test fixture only — split + interpolated to avoid secret-scanner false positives.
const validKey = `sk${'-'}ant${'-'}api03${'-'}${'A'.repeat(22)}`;

const ctx = (): FetchContext => ({
	credential: { plaintextSecret: validKey },
	logger: { debug: () => {}, warn: () => {} },
	now: () => new Date('2026-05-26T00:00:00Z'),
});

const params: MessagesWithWebSearchParams = {
	prompt: 'Best B2B CRMs for solo founders?',
	locationCountry: 'ES',
	locationLanguage: 'es',
	model: 'claude-sonnet-4-6',
	brandPromptId: '00000000-0000-0000-0000-00000000a173',
};

describe('fetchMessagesWithWebSearch', () => {
	it('builds a body matching the documented Anthropic web_search example (#173)', async () => {
		// Issue #173: Anthropic rejected every request with HTTP 400 because
		// the body included `tool_choice: { type: 'tool', name: 'web_search' }`,
		// a shape the API does not accept for built-in server tools. The
		// official docs example for `web_search_20250305` omits `tool_choice`
		// entirely (the model auto-decides to call the tool). Lock that in so
		// nobody re-adds `tool_choice` without realising it breaks production.
		let capturedBody: Record<string, unknown> | undefined;
		const fakeHttp = {
			post: async (_path: string, body: unknown) => {
				capturedBody = body as Record<string, unknown>;
				return { id: 'msg_test', content: [] };
			},
		} as unknown as AnthropicHttp;

		await fetchMessagesWithWebSearch(fakeHttp, params, ctx());

		expect(capturedBody).toBeDefined();
		expect(capturedBody?.model).toBe('claude-sonnet-4-6');
		expect(capturedBody?.tool_choice).toBeUndefined();

		const tools = capturedBody?.tools as Record<string, unknown>[];
		expect(tools).toHaveLength(1);
		expect(tools[0]?.type).toBe('web_search_20250305');
		expect(tools[0]?.name).toBe('web_search');
		expect(tools[0]?.max_uses).toBe(5);

		const userLocation = tools[0]?.user_location as Record<string, string>;
		expect(userLocation.country).toBe('ES');
		// ES has a mapped timezone — verify it gets attached for stability.
		expect(userLocation.timezone).toBe('Europe/Madrid');
	});

	it('omits the timezone field when the country is not in the mapping table', async () => {
		let capturedBody: Record<string, unknown> | undefined;
		const fakeHttp = {
			post: async (_path: string, body: unknown) => {
				capturedBody = body as Record<string, unknown>;
				return { id: 'msg_test', content: [] };
			},
		} as unknown as AnthropicHttp;

		await fetchMessagesWithWebSearch(fakeHttp, { ...params, locationCountry: 'ZA' /* unmapped */ }, ctx());

		const tools = capturedBody?.tools as Record<string, unknown>[];
		const userLocation = tools[0]?.user_location as Record<string, string>;
		expect(userLocation.country).toBe('ZA');
		expect(userLocation.timezone).toBeUndefined();
	});

	it('returns an empty payload when Anthropic returns a non-object response', async () => {
		const fakeHttp = {
			post: async (): Promise<null> => null,
		} as unknown as AnthropicHttp;

		const result = await fetchMessagesWithWebSearch(fakeHttp, params, ctx());

		expect(result).toEqual({});
	});
});
