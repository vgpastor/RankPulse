import type { ProjectManagement } from '@rankpulse/domain';
import { Uuid } from '@rankpulse/shared';
import { InMemoryLlmAnswerReadModel } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import { QueryAiSearchAlertsUseCase } from './query-ai-search-alerts.use-case.js';

const ONE_DAY = 24 * 60 * 60 * 1000;

describe('QueryAiSearchAlertsUseCase', () => {
	it('returns no alerts when there are no captures', async () => {
		const projectId = Uuid.generate() as ProjectManagement.ProjectId;
		const readModel = new InMemoryLlmAnswerReadModel();
		const useCase = new QueryAiSearchAlertsUseCase(readModel);
		const alerts = await useCase.execute({ projectId });
		expect(alerts).toEqual([]);
	});

	it('flags BrandLostCitation when an own URL streak is broken in the most recent capture', async () => {
		const projectId = Uuid.generate() as ProjectManagement.ProjectId;
		const readModel = new InMemoryLlmAnswerReadModel();
		const baseDay = new Date('2026-05-01T07:00:00Z');
		// Days 1-4 cite the URL; day 5 does not.
		readModel.setRows([
			...[0, 1, 2, 3].map((d) => ({
				id: `r${d}`,
				brandPromptId: 'p1',
				projectId,
				aiProvider: 'openai' as const,
				country: 'ES',
				language: 'es',
				mentions: [],
				citations: [{ url: 'https://patroltech.com/features', domain: 'patroltech.com', isOwnDomain: true }],
				capturedAt: new Date(baseDay.getTime() + d * ONE_DAY),
			})),
			{
				id: 'r4',
				brandPromptId: 'p1',
				projectId,
				aiProvider: 'openai',
				country: 'ES',
				language: 'es',
				mentions: [],
				citations: [],
				capturedAt: new Date(baseDay.getTime() + 4 * ONE_DAY),
			},
		]);
		const useCase = new QueryAiSearchAlertsUseCase(readModel);
		const alerts = await useCase.execute({
			projectId,
			asOf: new Date(baseDay.getTime() + 4 * ONE_DAY + 60_000),
		});
		const lost = alerts.find((a) => a.kind === 'BrandLostCitation');
		expect(lost).toBeDefined();
		expect(lost?.subject).toBe('https://patroltech.com/features');
	});

	it('flags CompetitorOvertook when a competitor avg position is better', async () => {
		const projectId = Uuid.generate() as ProjectManagement.ProjectId;
		const readModel = new InMemoryLlmAnswerReadModel();
		const day = new Date('2026-05-05T07:00:00Z');
		readModel.setRows([
			{
				id: 'r1',
				brandPromptId: 'p1',
				projectId,
				aiProvider: 'openai',
				country: 'ES',
				language: 'es',
				mentions: [
					{ brand: 'Patroltech', isOwnBrand: true, position: 3, citedUrl: null },
					{ brand: 'Tracktik', isOwnBrand: false, position: 1, citedUrl: null },
				],
				citations: [],
				capturedAt: day,
			},
		]);
		const useCase = new QueryAiSearchAlertsUseCase(readModel);
		const alerts = await useCase.execute({
			projectId,
			asOf: new Date(day.getTime() + 60_000),
		});
		const overtook = alerts.find((a) => a.kind === 'CompetitorOvertook');
		expect(overtook).toBeDefined();
		expect(overtook?.subject).toBe('Tracktik');
		expect(overtook?.details.competitorAvgPosition).toBe(1);
		expect(overtook?.details.ownAvgPosition).toBe(3);
	});

	it('does not flag CompetitorOvertook when own brand is ahead', async () => {
		const projectId = Uuid.generate() as ProjectManagement.ProjectId;
		const readModel = new InMemoryLlmAnswerReadModel();
		const day = new Date('2026-05-05T07:00:00Z');
		readModel.setRows([
			{
				id: 'r1',
				brandPromptId: 'p1',
				projectId,
				aiProvider: 'openai',
				country: 'ES',
				language: 'es',
				mentions: [
					{ brand: 'Patroltech', isOwnBrand: true, position: 1, citedUrl: null },
					{ brand: 'Tracktik', isOwnBrand: false, position: 3, citedUrl: null },
				],
				citations: [],
				capturedAt: day,
			},
		]);
		const useCase = new QueryAiSearchAlertsUseCase(readModel);
		const alerts = await useCase.execute({
			projectId,
			asOf: new Date(day.getTime() + 60_000),
		});
		expect(alerts.filter((a) => a.kind === 'CompetitorOvertook')).toEqual([]);
	});
});
