import { AiSearchInsights, type ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { InMemoryLlmAnswerReadModel } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryCompetitiveMatrixUseCase } from './query-competitive-matrix.use-case.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const PROMPT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as AiSearchInsights.BrandPromptId;

describe('QueryCompetitiveMatrixUseCase', () => {
	let readModel: InMemoryLlmAnswerReadModel;
	let useCase: QueryCompetitiveMatrixUseCase;

	beforeEach(() => {
		readModel = new InMemoryLlmAnswerReadModel();
		useCase = new QueryCompetitiveMatrixUseCase(readModel);
	});

	it('returns one cell per (provider, country, language, brand) with mention rate', async () => {
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
					{ brand: 'CompetitorX', isOwnBrand: false, position: 2, citedUrl: null },
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

		// One cell per brand: OurBrand (own) at 100% and CompetitorX at 50%.
		expect(result).toHaveLength(2);
		const own = result.find((c) => c.brand === 'OurBrand');
		expect(own?.isOwnBrand).toBe(true);
		expect(own?.mentionRate).toBe(1);
		const comp = result.find((c) => c.brand === 'CompetitorX');
		expect(comp?.isOwnBrand).toBe(false);
		expect(comp?.mentionRate).toBe(0.5);
	});

	it('separates cells across providers and locales (cells share brand but not provider/locale)', async () => {
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
				country: 'ES',
				language: 'es',
				mentions: [{ brand: 'OurBrand', isOwnBrand: true, position: 2, citedUrl: null }],
				citations: [],
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			},
		]);

		const result = await useCase.execute({
			projectId: PROJECT_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(2);
		expect(result.map((c) => `${c.aiProvider}|${c.country}`).sort()).toEqual(['anthropic|ES', 'openai|US']);
	});

	it('returns empty array when no answers in window', async () => {
		readModel.setRows([]);
		const result = await useCase.execute({
			projectId: PROJECT_ID,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});
		expect(result).toEqual([]);
	});
});
