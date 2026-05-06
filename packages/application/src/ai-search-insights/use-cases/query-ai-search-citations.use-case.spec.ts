import type { ProjectManagement } from '@rankpulse/domain';
import { Uuid } from '@rankpulse/shared';
import { InMemoryLlmAnswerReadModel } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import { QueryAiSearchCitationsUseCase } from './query-ai-search-citations.use-case.js';

describe('QueryAiSearchCitationsUseCase', () => {
	it('groups citations by URL and aggregates providers/timestamps', async () => {
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
				mentions: [],
				citations: [
					{ url: 'https://patroltech.com/features', domain: 'patroltech.com', isOwnDomain: true },
					{ url: 'https://other.com/blog', domain: 'other.com', isOwnDomain: false },
				],
				capturedAt: new Date('2026-05-04T07:00:00Z'),
			},
			{
				id: 'a2',
				brandPromptId: 'p1',
				projectId,
				aiProvider: 'anthropic',
				country: 'ES',
				language: 'es',
				mentions: [],
				citations: [{ url: 'https://patroltech.com/features', domain: 'patroltech.com', isOwnDomain: true }],
				capturedAt: new Date('2026-05-05T07:00:00Z'),
			},
		]);
		const useCase = new QueryAiSearchCitationsUseCase(readModel);
		const items = await useCase.execute({
			projectId,
			from: new Date('2026-05-01T00:00:00Z'),
			to: new Date('2026-05-06T00:00:00Z'),
			onlyOwnDomains: false,
		});
		const own = items.find((i) => i.url === 'https://patroltech.com/features');
		expect(own?.totalCitations).toBe(2);
		expect([...(own?.providers ?? [])].sort()).toEqual(['anthropic', 'openai']);
		expect(items).toHaveLength(2);
	});

	it('filters to own domains when onlyOwnDomains=true', async () => {
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
				mentions: [],
				citations: [
					{ url: 'https://patroltech.com', domain: 'patroltech.com', isOwnDomain: true },
					{ url: 'https://blog.example.com', domain: 'example.com', isOwnDomain: false },
				],
				capturedAt: new Date('2026-05-05T07:00:00Z'),
			},
		]);
		const useCase = new QueryAiSearchCitationsUseCase(readModel);
		const items = await useCase.execute({ projectId, onlyOwnDomains: true });
		expect(items).toHaveLength(1);
		expect(items[0]?.isOwnDomain).toBe(true);
	});
});
