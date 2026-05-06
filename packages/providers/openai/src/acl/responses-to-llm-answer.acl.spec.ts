import { describe, expect, it } from 'vitest';
import { normaliseOpenAiResponse } from './responses-to-llm-answer.acl.js';

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
