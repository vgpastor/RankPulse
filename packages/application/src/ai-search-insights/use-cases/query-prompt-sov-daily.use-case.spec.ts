import { AiSearchInsights, type ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { InMemoryLlmAnswerReadModel } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryPromptSovDailyUseCase } from './query-prompt-sov-daily.use-case.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const PROMPT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as AiSearchInsights.BrandPromptId;
const OTHER_PROMPT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as AiSearchInsights.BrandPromptId;

describe('QueryPromptSovDailyUseCase', () => {
	let readModel: InMemoryLlmAnswerReadModel;
	let useCase: QueryPromptSovDailyUseCase;

	beforeEach(() => {
		readModel = new InMemoryLlmAnswerReadModel();
		useCase = new QueryPromptSovDailyUseCase(readModel);
	});

	it('returns one bucket per UTC day with mention rate', async () => {
		readModel.setRows([
			{
				id: 'a1',
				brandPromptId: PROMPT_ID,
				projectId: PROJECT_ID,
				aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
				country: 'US',
				language: 'en',
				mentions: [{ brand: 'OurBrand', isOwnBrand: true, position: 1, citedUrl: null }],
				citations: [],
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			},
			{
				id: 'a2',
				brandPromptId: PROMPT_ID,
				projectId: PROJECT_ID,
				aiProvider: AiSearchInsights.AiProviderNames.ANTHROPIC,
				country: 'US',
				language: 'en',
				mentions: [],
				citations: [],
				capturedAt: new Date('2026-05-01T20:00:00Z'),
			},
			{
				id: 'a3',
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
			brandPromptId: PROMPT_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(2);
		const day1 = result.find((p) => p.day === '2026-05-01');
		// 2 captures on 2026-05-01, 1 with own mention → rate 0.5
		expect(day1?.totalAnswers).toBe(2);
		expect(day1?.answersWithOwnMention).toBe(1);
		expect(day1?.mentionRate).toBe(0.5);
		const day2 = result.find((p) => p.day === '2026-05-02');
		// Single capture, mentioned → rate 1.0
		expect(day2?.mentionRate).toBe(1);
	});

	it('returns mentionRate=0 when totalAnswers is 0 (defensive guard against div-by-zero)', async () => {
		readModel.setRows([]);
		const result = await useCase.execute({
			brandPromptId: PROMPT_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});
		expect(result).toEqual([]);
	});

	it('scopes results to the requested prompt', async () => {
		readModel.setRows([
			{
				id: 'a1',
				brandPromptId: PROMPT_ID,
				projectId: PROJECT_ID,
				aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
				country: 'US',
				language: 'en',
				mentions: [{ brand: 'OurBrand', isOwnBrand: true, position: 1, citedUrl: null }],
				citations: [],
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			},
			{
				id: 'a2',
				brandPromptId: OTHER_PROMPT_ID,
				projectId: PROJECT_ID,
				aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
				country: 'US',
				language: 'en',
				mentions: [{ brand: 'OurBrand', isOwnBrand: true, position: 1, citedUrl: null }],
				citations: [],
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			},
		]);

		const result = await useCase.execute({
			brandPromptId: PROMPT_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.totalAnswers).toBe(1);
	});
});
