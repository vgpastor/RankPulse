import { describe, expect, it } from 'vitest';
import { normalisePerplexityResponse } from './sonar-to-llm-answer.acl.js';

describe('normalisePerplexityResponse', () => {
	it('extracts message content, citations and search count', () => {
		const result = normalisePerplexityResponse({
			id: 'cmpl_123',
			model: 'sonar',
			object: 'chat.completion',
			choices: [
				{
					index: 0,
					message: {
						role: 'assistant',
						content: 'Patroltech leads the guard-tour space [1]. Tracktik is also a player [2].',
					},
					finish_reason: 'stop',
				},
			],
			citations: ['https://patroltech.com', 'https://tracktik.com', 'https://patroltech.com'],
			usage: {
				prompt_tokens: 100,
				completion_tokens: 200,
				total_tokens: 300,
				num_search_queries: 1,
			},
		});

		expect(result.aiProvider).toBe('perplexity');
		expect(result.model).toBe('sonar');
		expect(result.rawText).toContain('Patroltech leads');
		// Citations deduplicated.
		expect(result.citationUrls).toEqual(['https://patroltech.com', 'https://tracktik.com']);
		expect(result.tokenUsage.webSearchCalls).toBe(1);
		// 1 search × 0.5 cent + token cost (~$0.30/1M) = ~0.5 cents.
		expect(result.costCents).toBeGreaterThanOrEqual(0.5);
	});

	it('defaults webSearchCalls to 1 when usage.num_search_queries is missing', () => {
		const result = normalisePerplexityResponse({
			model: 'sonar',
			choices: [{ message: { role: 'assistant', content: 'x' } }],
			citations: [],
			usage: { prompt_tokens: 10, completion_tokens: 5 },
		});
		expect(result.tokenUsage.webSearchCalls).toBe(1);
	});

	it('returns empty defaults on a malformed payload', () => {
		const result = normalisePerplexityResponse({});
		expect(result.rawText).toBe('');
		expect(result.citationUrls).toEqual([]);
	});
});
