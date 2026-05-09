import { CompetitorIntelligence, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import {
	aProject,
	InMemoryCompetitorKeywordGapRepository,
	InMemoryProjectRepository,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryKeywordGapsUseCase } from './query-keyword-gaps.use-case.js';

const orgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;

const buildGap = (
	overrides: Partial<{
		projectId: ProjectManagement.ProjectId;
		keyword: string;
		searchVolume: number | null;
		cpc: number | null;
		keywordDifficulty: number | null;
		observedAt: Date;
	}>,
): CompetitorIntelligence.CompetitorKeywordGap =>
	CompetitorIntelligence.CompetitorKeywordGap.record({
		id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as CompetitorIntelligence.CompetitorKeywordGapId,
		projectId: overrides.projectId ?? ('p' as Uuid as ProjectManagement.ProjectId),
		ourDomain: 'controlrondas.com',
		competitorDomain: 'rondacontrol.es',
		keyword: overrides.keyword ?? 'control de rondas',
		country: 'ES',
		language: 'es',
		ourPosition: null,
		theirPosition: 4,
		searchVolume: overrides.searchVolume ?? 720,
		cpc: overrides.cpc ?? 1.4,
		keywordDifficulty: overrides.keywordDifficulty ?? 22,
		sourceProvider: 'dataforseo',
		rawPayloadId: null,
		observedAt: overrides.observedAt ?? new Date('2026-05-09T06:00:00Z'),
	});

describe('QueryKeywordGapsUseCase', () => {
	let projects: InMemoryProjectRepository;
	let gaps: InMemoryCompetitorKeywordGapRepository;
	let project: ProjectManagement.Project;
	let useCase: QueryKeywordGapsUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		gaps = new InMemoryCompetitorKeywordGapRepository();
		project = aProject({ organizationId: orgId });
		await projects.save(project);
		useCase = new QueryKeywordGapsUseCase(projects, gaps);
	});

	it('returns rows ranked by ROI score descending with the score in the DTO', async () => {
		// low: roi = (50 * 0.5) / (10 + 1) ≈ 2.27
		// high: roi = (1000 * 2) / (5 + 1) ≈ 333.33
		await gaps.saveAll([
			buildGap({
				projectId: project.id,
				keyword: 'low',
				searchVolume: 50,
				cpc: 0.5,
				keywordDifficulty: 10,
			}),
			buildGap({
				projectId: project.id,
				keyword: 'high',
				searchVolume: 1000,
				cpc: 2,
				keywordDifficulty: 5,
			}),
		]);
		const result = await useCase.execute({
			projectId: project.id,
			ourDomain: 'controlrondas.com',
			competitorDomain: 'rondacontrol.es',
		});
		expect(result.rows.map((r) => r.keyword)).toEqual(['high', 'low']);
		expect(result.rows[0]?.roiScore).toBeCloseTo(333.33, 1);
		expect(typeof result.rows[0]?.observedAt).toBe('string');
	});

	it('respects the minVolume filter', async () => {
		await gaps.saveAll([
			buildGap({ projectId: project.id, keyword: 'tail', searchVolume: 10 }),
			buildGap({ projectId: project.id, keyword: 'head', searchVolume: 1000 }),
		]);
		const result = await useCase.execute({
			projectId: project.id,
			ourDomain: 'controlrondas.com',
			competitorDomain: 'rondacontrol.es',
			minVolume: 100,
		});
		expect(result.rows.map((r) => r.keyword)).toEqual(['head']);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({
				projectId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
				ourDomain: 'controlrondas.com',
				competitorDomain: 'rondacontrol.es',
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
