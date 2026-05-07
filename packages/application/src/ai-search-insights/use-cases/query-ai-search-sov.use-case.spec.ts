import { AiSearchInsights, type ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { InMemoryLlmAnswerReadModel } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryAiSearchSovUseCase } from './query-ai-search-sov.use-case.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const PROMPT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as AiSearchInsights.BrandPromptId;

describe('QueryAiSearchSovUseCase', () => {
	let readModel: InMemoryLlmAnswerReadModel;
	let useCase: QueryAiSearchSovUseCase;

	beforeEach(() => {
		readModel = new InMemoryLlmAnswerReadModel();
		useCase = new QueryAiSearchSovUseCase(readModel);
	});

	it('returns one row per (provider, locale, brand) with computed mention rate', async () => {
		readModel.setRows([
			{
				id: 'a1',
				brandPromptId: PROMPT_ID,
				projectId: PROJECT_ID,
				aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
				country: 'US',
				language: 'en',
				mentions: [
					{ brand: 'OurBrand', isOwnBrand: true, position: 1, citedUrl: null },
					{ brand: 'Competitor', isOwnBrand: false, position: 2, citedUrl: null },
				],
				citations: [],
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			},
			{
				id: 'a2',
				brandPromptId: PROMPT_ID,
				projectId: PROJECT_ID,
				aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
				country: 'US',
				language: 'en',
				mentions: [{ brand: 'OurBrand', isOwnBrand: true, position: 1, citedUrl: null }],
				citations: [],
				capturedAt: new Date('2026-05-02T10:00:00Z'),
			},
		]);

		const result = await useCase.execute({
			projectId: PROJECT_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		// Two distinct brands → two rows
		expect(result).toHaveLength(2);
		const own = result.find((r) => r.brand === 'OurBrand');
		// 2 answers, both mention OurBrand → rate 1.0
		expect(own?.totalAnswers).toBe(2);
		expect(own?.answersWithMention).toBe(2);
		expect(own?.mentionRate).toBe(1);
		expect(own?.isOwnBrand).toBe(true);
		const competitor = result.find((r) => r.brand === 'Competitor');
		// 2 total answers, only 1 mentions Competitor → rate 0.5
		expect(competitor?.mentionRate).toBe(0.5);
		expect(competitor?.isOwnBrand).toBe(false);
	});

	it('returns empty array when no answers exist in the window', async () => {
		readModel.setRows([]);

		const result = await useCase.execute({
			projectId: PROJECT_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toEqual([]);
	});

	it('uses the default 30-day window when from/to omitted', async () => {
		// The DEFAULT_WINDOW_DAYS = 30 means rows older than ~30 days from now
		// are excluded. We seed two rows: one inside, one outside.
		readModel.setRows([
			{
				id: 'recent',
				brandPromptId: PROMPT_ID,
				projectId: PROJECT_ID,
				aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
				country: 'US',
				language: 'en',
				mentions: [{ brand: 'OurBrand', isOwnBrand: true, position: 1, citedUrl: null }],
				citations: [],
				capturedAt: new Date(),
			},
			{
				id: 'too-old',
				brandPromptId: PROMPT_ID,
				projectId: PROJECT_ID,
				aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
				country: 'US',
				language: 'en',
				mentions: [{ brand: 'OurBrand', isOwnBrand: true, position: 1, citedUrl: null }],
				citations: [],
				capturedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
			},
		]);

		const result = await useCase.execute({ projectId: PROJECT_ID });

		// Only the recent row is in scope; the 90-day-old row is dropped.
		expect(result).toHaveLength(1);
		expect(result[0]?.totalAnswers).toBe(1);
	});
});
