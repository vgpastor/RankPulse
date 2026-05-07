import { describe, expect, it } from 'vitest';
import { responsesWithWebSearchDescriptor } from '../endpoints/responses-with-web-search.js';
import { costFromRawPayload, normaliseOpenAiResponse } from './responses-to-llm-answer.acl.js';

describe('normaliseOpenAiResponse', () => {
	it('joins text spans, dedupes citations, counts web_search_calls', () => {
		const result = normaliseOpenAiResponse({
			id: 'resp_123',
			model: 'gpt-5-mini',
			output: [
				{ type: 'web_search_call', id: 'ws_1', status: 'completed' },
				{ type: 'web_search_call', id: 'ws_2', status: 'completed' },
				{
					type: 'message',
					role: 'assistant',
					content: [
						{
							type: 'output_text',
							text: 'Patroltech offers shift coverage.',
							annotations: [
								{
									type: 'url_citation',
									url: 'https://patroltech.com/features',
									title: 'Features',
								},
							],
						},
						{
							type: 'output_text',
							text: 'Tracktik is a competitor.',
							annotations: [
								{
									type: 'url_citation',
									url: 'https://tracktik.com',
									title: 'Tracktik',
								},
								// Duplicate URL — should appear once in citations.
								{
									type: 'url_citation',
									url: 'https://patroltech.com/features',
									title: 'Patroltech',
								},
							],
						},
					],
				},
			],
			usage: {
				input_tokens: 100,
				output_tokens: 200,
				input_tokens_details: { cached_tokens: 50 },
			},
		});

		expect(result.aiProvider).toBe('openai');
		expect(result.model).toBe('gpt-5-mini');
		expect(result.rawText).toBe('Patroltech offers shift coverage.\nTracktik is a competitor.');
		expect(result.citationUrls).toEqual(['https://patroltech.com/features', 'https://tracktik.com']);
		expect(result.tokenUsage.webSearchCalls).toBe(2);
		expect(result.tokenUsage.cachedInputTokens).toBe(50);
		// Cost: 2 web_search × 3 cents = 6 cents (token cost is negligible at
		// these sizes).
		expect(result.costCents).toBeGreaterThanOrEqual(6);
	});

	it('falls back to output_text when output[] does not carry message items', () => {
		const result = normaliseOpenAiResponse({
			model: 'gpt-5-mini',
			output: [],
			output_text: 'Concise answer.',
			usage: { input_tokens: 10, output_tokens: 5 },
		});
		expect(result.rawText).toBe('Concise answer.');
		expect(result.citationUrls).toEqual([]);
		expect(result.tokenUsage.webSearchCalls).toBe(0);
	});

	it('returns sane defaults when fields are missing', () => {
		const result = normaliseOpenAiResponse({});
		expect(result.rawText).toBe('');
		expect(result.citationUrls).toEqual([]);
		expect(result.model).toBe('gpt-5-mini');
		expect(result.costCents).toBe(0);
	});
});

describe('costFromRawPayload (OpenAI)', () => {
	it('matches the cost computed by normaliseOpenAiResponse on the same payload', () => {
		const raw = {
			model: 'gpt-5-mini',
			output: [
				{ type: 'web_search_call', id: 'ws_1', status: 'completed' },
				{ type: 'web_search_call', id: 'ws_2', status: 'completed' },
			],
			usage: {
				input_tokens: 1_000,
				output_tokens: 2_000,
				input_tokens_details: { cached_tokens: 200 },
			},
		};
		expect(costFromRawPayload(raw)).toBe(normaliseOpenAiResponse(raw).costCents);
	});

	it('returns 0 when usage is missing — defensive against malformed responses', () => {
		expect(costFromRawPayload({})).toBe(0);
	});
});

describe('responsesWithWebSearchDescriptor.costFor', () => {
	it('charges typical-call cost (well below the 3.5¢ worst-case)', () => {
		const typical = {
			usage: { input_tokens: 200, output_tokens: 500 },
			output: [{ type: 'web_search_call' }],
		};
		const cost = responsesWithWebSearchDescriptor.costFor?.({}, typical) ?? -1;
		expect(cost).toBeGreaterThan(0);
		expect(cost).toBeLessThan(responsesWithWebSearchDescriptor.cost.amount);
		// 1 web_search × 3¢ + tokens (200 × $0.40/M + 500 × $1.60/M ≈ 0.088¢)
		// → ~3.09¢. Range allows for pricing nudges without being brittle.
		expect(cost).toBeGreaterThanOrEqual(3);
		expect(cost).toBeLessThan(3.2);
	});
});
