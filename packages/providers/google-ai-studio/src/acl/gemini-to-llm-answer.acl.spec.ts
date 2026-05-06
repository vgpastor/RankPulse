import { describe, expect, it } from 'vitest';
import { normaliseGeminiResponse } from './gemini-to-llm-answer.acl.js';

describe('normaliseGeminiResponse', () => {
	it('extracts text from content.parts and citations from groundingMetadata', () => {
		const result = normaliseGeminiResponse({
			modelVersion: 'gemini-2.5-flash',
			candidates: [
				{
					content: {
						role: 'model',
						parts: [
							{ text: 'Patroltech is the leading option.' },
							{ text: ' Tracktik is a notable competitor.' },
						],
					},
					finishReason: 'STOP',
					groundingMetadata: {
						groundingChunks: [
							{ web: { uri: 'https://patroltech.com', title: 'Patroltech' } },
							{ web: { uri: 'https://tracktik.com', title: 'Tracktik' } },
							// Duplicate — should dedupe.
							{ web: { uri: 'https://patroltech.com', title: 'Patroltech' } },
						],
						webSearchQueries: ['guard tour software comparison'],
					},
				},
			],
			usageMetadata: {
				promptTokenCount: 50,
				candidatesTokenCount: 200,
				totalTokenCount: 250,
			},
		});

		expect(result.aiProvider).toBe('google-ai-studio');
		expect(result.model).toBe('gemini-2.5-flash');
		expect(result.rawText).toBe('Patroltech is the leading option. Tracktik is a notable competitor.');
		expect(result.citationUrls).toEqual(['https://patroltech.com', 'https://tracktik.com']);
		expect(result.tokenUsage.webSearchCalls).toBe(1);
		// 1 grounding × 3.5 cent = 3.5 cents (token cost negligible at this size).
		expect(result.costCents).toBeGreaterThanOrEqual(3.5);
	});

	it('returns empty result on missing candidate', () => {
		const result = normaliseGeminiResponse({});
		expect(result.rawText).toBe('');
		expect(result.citationUrls).toEqual([]);
		expect(result.tokenUsage.webSearchCalls).toBe(0);
	});

	it('handles candidates with no groundingMetadata (model didnt search)', () => {
		const result = normaliseGeminiResponse({
			candidates: [{ content: { parts: [{ text: 'Concise answer.' }] }, finishReason: 'STOP' }],
			usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
		});
		expect(result.rawText).toBe('Concise answer.');
		expect(result.citationUrls).toEqual([]);
		expect(result.tokenUsage.webSearchCalls).toBe(0);
	});
});
