import { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { InMemoryLlmAnswerRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryLlmAnswersUseCase } from './query-llm-answers.use-case.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const OTHER_PROJECT_ID = '22222222-2222-2222-2222-222222222222' as Uuid as ProjectManagement.ProjectId;
const PROMPT_ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as AiSearchInsights.BrandPromptId;
const PROMPT_ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as AiSearchInsights.BrandPromptId;

const buildAnswer = (overrides: {
	id: string;
	brandPromptId?: AiSearchInsights.BrandPromptId;
	projectId?: ProjectManagement.ProjectId;
	aiProvider?: AiSearchInsights.AiProviderName;
	country?: string;
	language?: string;
	capturedAt: Date;
}): AiSearchInsights.LlmAnswer =>
	AiSearchInsights.LlmAnswer.record({
		id: overrides.id as Uuid as AiSearchInsights.LlmAnswerId,
		brandPromptId: overrides.brandPromptId ?? PROMPT_ID_A,
		projectId: overrides.projectId ?? PROJECT_ID,
		aiProvider: overrides.aiProvider ?? AiSearchInsights.AiProviderNames.OPENAI,
		model: 'gpt-5-mini',
		location: ProjectManagement.LocationLanguage.create({
			country: overrides.country ?? 'US',
			language: overrides.language ?? 'en',
		}),
		rawText: 'sample answer',
		mentions: [],
		citations: [],
		tokenUsage: AiSearchInsights.TokenUsage.zero(),
		costCents: 0,
		rawPayloadId: null,
		now: overrides.capturedAt,
	});

describe('QueryLlmAnswersUseCase', () => {
	let repo: InMemoryLlmAnswerRepository;
	let useCase: QueryLlmAnswersUseCase;

	beforeEach(() => {
		repo = new InMemoryLlmAnswerRepository();
		useCase = new QueryLlmAnswersUseCase(repo);
	});

	it('returns answers for the project sorted newest-first', async () => {
		await repo.save(
			buildAnswer({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			}),
		);
		await repo.save(
			buildAnswer({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				capturedAt: new Date('2026-05-02T10:00:00Z'),
			}),
		);

		const result = await useCase.execute({ projectId: PROJECT_ID });

		expect(result).toHaveLength(2);
		expect(result[0]?.capturedAt).toBe(new Date('2026-05-02T10:00:00Z').toISOString());
		expect(result[1]?.capturedAt).toBe(new Date('2026-05-01T10:00:00Z').toISOString());
	});

	it('filters by brandPromptId when supplied', async () => {
		await repo.save(
			buildAnswer({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				brandPromptId: PROMPT_ID_A,
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			}),
		);
		await repo.save(
			buildAnswer({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				brandPromptId: PROMPT_ID_B,
				capturedAt: new Date('2026-05-02T10:00:00Z'),
			}),
		);

		const result = await useCase.execute({ projectId: PROJECT_ID, brandPromptId: PROMPT_ID_A });

		expect(result).toHaveLength(1);
		expect(result[0]?.brandPromptId).toBe(PROMPT_ID_A);
	});

	it('filters by aiProvider, country, language when supplied', async () => {
		await repo.save(
			buildAnswer({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
				country: 'ES',
				language: 'es',
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			}),
		);
		await repo.save(
			buildAnswer({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				aiProvider: AiSearchInsights.AiProviderNames.ANTHROPIC,
				country: 'US',
				language: 'en',
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			}),
		);

		const result = await useCase.execute({
			projectId: PROJECT_ID,
			aiProvider: AiSearchInsights.AiProviderNames.OPENAI,
			country: 'ES',
			language: 'es',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.aiProvider).toBe(AiSearchInsights.AiProviderNames.OPENAI);
	});

	it('honours from/to window', async () => {
		await repo.save(
			buildAnswer({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				capturedAt: new Date('2026-04-15T00:00:00Z'),
			}),
		);
		await repo.save(
			buildAnswer({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				capturedAt: new Date('2026-05-15T00:00:00Z'),
			}),
		);

		const result = await useCase.execute({
			projectId: PROJECT_ID,
			from: new Date('2026-05-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.capturedAt).toBe(new Date('2026-05-15T00:00:00Z').toISOString());
	});

	it('respects the limit parameter (default 50, override applied)', async () => {
		for (let i = 0; i < 5; i++) {
			await repo.save(
				buildAnswer({
					id: `dddddddd-dddd-dddd-dddd-${String(i).padStart(12, '0')}` as Uuid,
					capturedAt: new Date(`2026-05-0${i + 1}T10:00:00Z`),
				}),
			);
		}

		const result = await useCase.execute({ projectId: PROJECT_ID, limit: 2 });

		expect(result).toHaveLength(2);
	});

	it('scopes results to the requested project', async () => {
		await repo.save(
			buildAnswer({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			}),
		);
		await repo.save(
			buildAnswer({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				projectId: OTHER_PROJECT_ID,
				capturedAt: new Date('2026-05-01T10:00:00Z'),
			}),
		);

		const result = await useCase.execute({ projectId: PROJECT_ID });

		expect(result).toHaveLength(1);
		expect(result[0]?.projectId).toBe(PROJECT_ID);
	});
});
