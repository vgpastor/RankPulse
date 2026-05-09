import { AiSearchInsights, type ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { InMemoryLlmAnswerReadModel } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryProjectSovDailyUseCase } from './query-project-sov-daily.use-case.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const OTHER_PROJECT_ID = '22222222-2222-2222-2222-222222222222' as Uuid as ProjectManagement.ProjectId;
const PROMPT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as AiSearchInsights.BrandPromptId;
const PROMPT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as AiSearchInsights.BrandPromptId;

describe('QueryProjectSovDailyUseCase', () => {
	let readModel: InMemoryLlmAnswerReadModel;
	let useCase: QueryProjectSovDailyUseCase;

	beforeEach(() => {
		readModel = new InMemoryLlmAnswerReadModel();
		useCase = new QueryProjectSovDailyUseCase(readModel);
	});

	it('aggregates across every prompt in the project for one bucket per UTC day', async () => {
		readModel.setRows([
			{
				id: 'a1',
				brandPromptId: PROMPT_A,
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
				brandPromptId: PROMPT_B,
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
				brandPromptId: PROMPT_B,
				projectId: PROJECT_ID,
				aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
				country: 'US',
				language: 'en',
				mentions: [{ brand: 'OurBrand', isOwnBrand: true, position: 2, citedUrl: null }],
				citations: [],
				capturedAt: new Date('2026-05-02T10:00:00Z'),
			},
		]);

		const result = await useCase.execute({
			projectId: PROJECT_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(2);
		const day1 = result.find((p) => p.day === '2026-05-01');
		expect(day1?.totalAnswers).toBe(2);
		expect(day1?.answersWithOwnMention).toBe(1);
		expect(day1?.mentionRate).toBe(0.5);
		const day2 = result.find((p) => p.day === '2026-05-02');
		expect(day2?.mentionRate).toBe(1);
	});

	it('returns mentionRate=0 when there are no captures in the window', async () => {
		readModel.setRows([]);
		const result = await useCase.execute({
			projectId: PROJECT_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});
		expect(result).toEqual([]);
	});

	it('scopes to the requested project (does not bleed in across-project rows)', async () => {
		readModel.setRows([
			{
				id: 'a1',
				brandPromptId: PROMPT_A,
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
				brandPromptId: PROMPT_B,
				projectId: OTHER_PROJECT_ID,
				aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
				country: 'US',
				language: 'en',
				mentions: [{ brand: 'OurBrand', isOwnBrand: true, position: 1, citedUrl: null }],
				citations: [],
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			},
		]);

		const result = await useCase.execute({
			projectId: PROJECT_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.totalAnswers).toBe(1);
	});
});
