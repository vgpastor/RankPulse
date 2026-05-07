import { describe, expect, it } from 'vitest';
import { messagesWithWebSearchDescriptor } from '../endpoints/messages-with-web-search.js';
import { costFromRawPayload, normaliseAnthropicResponse } from './messages-to-llm-answer.acl.js';

describe('normaliseAnthropicResponse', () => {
	it('joins text blocks, dedupes citation URLs, counts web_search requests', () => {
		const result = normaliseAnthropicResponse({
			id: 'msg_123',
			model: 'claude-sonnet-4-6',
			content: [
				{ type: 'tool_use', name: 'web_search', input: { query: 'patroltech reviews' } },
				{ type: 'tool_result', input: { results: [] } },
				{
					type: 'text',
					text: 'Patroltech is well regarded for guard-tour software.',
					citations: [
						{ type: 'web_search_result_location', url: 'https://patroltech.com/features', title: 'Features' },
					],
				},
				{
					type: 'text',
					text: 'Tracktik is a competitor.',
					citations: [
						{ type: 'web_search_result_location', url: 'https://tracktik.com', title: 'Tracktik' },
						// Duplicate URL — should appear once.
						{
							type: 'web_search_result_location',
							url: 'https://patroltech.com/features',
							title: 'Patroltech',
						},
					],
				},
			],
			usage: {
				input_tokens: 200,
				output_tokens: 800,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				server_tool_use: { web_search_requests: 2 },
			},
		});

		expect(result.aiProvider).toBe('anthropic');
		expect(result.model).toBe('claude-sonnet-4-6');
		expect(result.rawText).toBe(
			'Patroltech is well regarded for guard-tour software.\nTracktik is a competitor.',
		);
		expect(result.citationUrls).toEqual(['https://patroltech.com/features', 'https://tracktik.com']);
		expect(result.tokenUsage.webSearchCalls).toBe(2);
		// 2 web_search × 1 cent = 2 cents. Token cost ~1.2 cents (200 in × $3/1M
		// + 800 out × $15/1M).
		expect(result.costCents).toBeGreaterThanOrEqual(2);
	});

	it('handles missing usage and content gracefully', () => {
		const result = normaliseAnthropicResponse({});
		expect(result.rawText).toBe('');
		expect(result.citationUrls).toEqual([]);
		expect(result.tokenUsage.webSearchCalls).toBe(0);
		expect(result.costCents).toBe(0);
	});

	it('skips tool_use / tool_result blocks even when they carry text', () => {
		const result = normaliseAnthropicResponse({
			model: 'claude-haiku-4-5-20251001',
			content: [
				{ type: 'tool_use', name: 'web_search', text: 'this should NOT appear' },
				{ type: 'text', text: 'final answer' },
			],
		});
		expect(result.rawText).toBe('final answer');
	});
});

describe('costFromRawPayload (Anthropic)', () => {
	it('matches the cost computed by normaliseAnthropicResponse on the same payload', () => {
		const raw = {
			model: 'claude-sonnet-4-6',
			content: [],
			usage: {
				input_tokens: 200,
				output_tokens: 800,
				cache_creation_input_tokens: 100,
				cache_read_input_tokens: 50,
				server_tool_use: { web_search_requests: 2 },
			},
		};
		expect(costFromRawPayload(raw)).toBe(normaliseAnthropicResponse(raw).costCents);
	});

	it('returns 0 when usage is missing — defensive against malformed responses', () => {
		expect(costFromRawPayload({})).toBe(0);
	});
});

describe('messagesWithWebSearchDescriptor.costFor', () => {
	it('charges typical-call cost (well below the 11¢ worst-case)', () => {
		const typical = {
			model: 'claude-sonnet-4-6',
			usage: {
				input_tokens: 200,
				output_tokens: 800,
				server_tool_use: { web_search_requests: 2 },
			},
		};
		const cost = messagesWithWebSearchDescriptor.costFor?.({}, typical) ?? -1;
		expect(cost).toBeGreaterThan(0);
		expect(cost).toBeLessThan(messagesWithWebSearchDescriptor.cost.amount);
		// 2 web_search × 1¢ + tokens (~200 × $3/1M + 800 × $15/1M ≈ 1.26¢)
		// → ~3.26¢, well below the 11¢ worst-case ledger reservation.
		expect(cost).toBeCloseTo(3.26, 1);
	});
});
