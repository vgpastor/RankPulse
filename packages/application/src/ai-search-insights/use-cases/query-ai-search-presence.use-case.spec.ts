import type { ProjectManagement } from '@rankpulse/domain';
import { Uuid } from '@rankpulse/shared';
import { InMemoryLlmAnswerReadModel } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import { QueryAiSearchPresenceUseCase } from './query-ai-search-presence.use-case.js';

describe('QueryAiSearchPresenceUseCase', () => {
	it('computes mention rate, citation rate and own avg position', async () => {
		const projectId = Uuid.generate() as ProjectManagement.ProjectId;
		const readModel = new InMemoryLlmAnswerReadModel();
		readModel.setRows([
			{
				id: 'a1',
				brandPromptId: 'p1',
				projectId,
				aiProvider: 'openai',
				country: 'ES',
				language: 'es',
				mentions: [
					{ brand: 'Patroltech', isOwnBrand: true, position: 1, citedUrl: 'https://patroltech.com' },
				],
				citations: [{ url: 'https://patroltech.com', domain: 'patroltech.com', isOwnDomain: true }],
				capturedAt: new Date('2026-05-05T07:00:00Z'),
			},
			{
				id: 'a2',
				brandPromptId: 'p1',
				projectId,
				aiProvider: 'anthropic',
				country: 'ES',
				language: 'es',
				mentions: [{ brand: 'Tracktik', isOwnBrand: false, position: 1, citedUrl: null }],
				citations: [],
				capturedAt: new Date('2026-05-05T07:01:00Z'),
			},
		]);
		const useCase = new QueryAiSearchPresenceUseCase(readModel);
		const result = await useCase.execute({
			projectId,
			from: new Date('2026-05-04T00:00:00Z'),
			to: new Date('2026-05-06T00:00:00Z'),
		});
		expect(result.totalAnswers).toBe(2);
		expect(result.answersWithOwnMention).toBe(1);
		expect(result.mentionRate).toBe(0.5);
		expect(result.ownCitationCount).toBe(1);
		expect(result.citationRate).toBe(0.5);
		expect(result.ownAvgPosition).toBe(1);
		expect(result.competitorMentionCount).toBe(1);
	});

	it('returns zeros when no answers in window', async () => {
		const projectId = Uuid.generate() as ProjectManagement.ProjectId;
		const readModel = new InMemoryLlmAnswerReadModel();
		const useCase = new QueryAiSearchPresenceUseCase(readModel);
		const result = await useCase.execute({ projectId });
		expect(result.totalAnswers).toBe(0);
		expect(result.mentionRate).toBe(0);
		expect(result.ownAvgPosition).toBeNull();
	});
});
