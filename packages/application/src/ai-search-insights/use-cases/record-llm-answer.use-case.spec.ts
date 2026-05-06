import { AiSearchInsights } from '@rankpulse/domain';
import { Uuid } from '@rankpulse/shared';
import {
	InMemoryBrandPromptRepository,
	InMemoryLlmAnswerRepository,
	RecordingEventPublisher,
	ScriptedMentionExtractor,
	StaticBrandWatchlistResolver,
} from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import { RecordLlmAnswerUseCase } from './record-llm-answer.use-case.js';
import { RegisterBrandPromptUseCase } from './register-brand-prompt.use-case.js';

const fixedClock = (date: Date) => ({ now: () => date });
const fixedIds = (ids: string[]) => {
	let i = 0;
	return {
		generate: () => {
			const id = ids[i] ?? Uuid.generate();
			i++;
			return id as ReturnType<typeof Uuid.generate>;
		},
	};
};

describe('RecordLlmAnswerUseCase', () => {
	it('persists an LlmAnswer with mentions+citations and publishes LlmAnswerRecorded', async () => {
		const promptRepo = new InMemoryBrandPromptRepository();
		const answerRepo = new InMemoryLlmAnswerRepository();
		const events = new RecordingEventPublisher();

		const orgId = Uuid.generate();
		const projectId = Uuid.generate();
		const promptId = '00000000-0000-0000-0000-000000000a01';

		const register = new RegisterBrandPromptUseCase(
			promptRepo,
			fixedClock(new Date('2026-05-06T00:00:00Z')),
			fixedIds([promptId]),
			events,
		);
		await register.execute({
			organizationId: orgId,
			projectId,
			text: 'best B2B CRM',
			kind: 'category',
		});
		events.clear();

		const watchlist = [
			AiSearchInsights.BrandWatchEntry.create({
				name: 'Patroltech',
				aliases: [],
				ownDomains: ['patroltech.com'],
				isOwnBrand: true,
			}),
			AiSearchInsights.BrandWatchEntry.create({
				name: 'Tracktik',
				aliases: [],
				ownDomains: ['tracktik.com'],
				isOwnBrand: false,
			}),
		];
		const watchlistResolver = new StaticBrandWatchlistResolver(watchlist);

		const extractor = new ScriptedMentionExtractor();
		extractor.setNext({
			mentions: [
				AiSearchInsights.BrandMention.create({
					brand: 'Patroltech',
					position: 1,
					sentiment: 'positive',
					citedUrl: 'https://patroltech.com/features',
				}),
			],
			judgeTokenUsage: AiSearchInsights.TokenUsage.create({
				inputTokens: 50,
				outputTokens: 30,
				cachedInputTokens: 0,
				webSearchCalls: 0,
			}),
			judgeCostCents: 0.05,
		});

		const useCase = new RecordLlmAnswerUseCase(
			promptRepo,
			answerRepo,
			watchlistResolver,
			extractor,
			fixedClock(new Date('2026-05-06T07:01:00Z')),
			fixedIds(['00000000-0000-0000-0000-000000000a02']),
			events,
		);

		const result = await useCase.execute({
			brandPromptId: promptId,
			country: 'ES',
			language: 'es',
			rawPayloadId: null,
			response: {
				aiProvider: 'openai',
				model: 'gpt-5-mini',
				rawText: 'Patroltech is the leading option for B2B SaaS.',
				citationUrls: ['https://patroltech.com/features', 'https://other.com'],
				tokenUsage: AiSearchInsights.TokenUsage.create({
					inputTokens: 100,
					outputTokens: 200,
					cachedInputTokens: 0,
					webSearchCalls: 1,
				}),
				costCents: 3.0,
			},
		});

		expect(result.mentionsExtracted).toBe(1);
		expect(result.citationsExtracted).toBe(2);

		const stored = await answerRepo.findById(
			result.llmAnswerId as ReturnType<typeof Uuid.generate> as AiSearchInsights.LlmAnswerId,
		);
		expect(stored?.mentions[0]?.brand).toBe('Patroltech');
		expect(stored?.citations.find((c) => c.domain === 'patroltech.com')?.isOwnDomain).toBe(true);
		expect(stored?.citations.find((c) => c.domain === 'other.com')?.isOwnDomain).toBe(false);
		// Combined cost: upstream (3.0) + judge (0.05).
		expect(stored?.costCents).toBeCloseTo(3.05, 2);

		expect(events.publishedTypes()).toContain('LlmAnswerRecorded');

		// The extractor received the resolved watchlist and locale.
		expect(extractor.lastInput?.watchlist).toBe(watchlist);
		expect(extractor.lastInput?.location.toString()).toBe('es-ES');
	});
});
