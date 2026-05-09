import { type IdentityAccess, type ProjectManagement, RankTracking } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import {
	aProject,
	InMemoryProjectRepository,
	InMemoryRankedKeywordObservationRepository,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryRankedKeywordsUseCase } from './query-ranked-keywords.use-case.js';

const orgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;

const buildObs = (
	overrides: Partial<{
		projectId: ProjectManagement.ProjectId;
		keyword: string;
		searchVolume: number | null;
		trafficEstimate: number | null;
		observedAt: Date;
	}>,
): RankTracking.RankedKeywordObservation =>
	RankTracking.RankedKeywordObservation.record({
		id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as RankTracking.RankedKeywordObservationId,
		projectId: overrides.projectId ?? ('p' as Uuid as ProjectManagement.ProjectId),
		targetDomain: 'controlrondas.com',
		keyword: overrides.keyword ?? 'control de rondas',
		country: 'ES',
		language: 'es',
		position: 5,
		searchVolume: overrides.searchVolume ?? 720,
		keywordDifficulty: 22,
		trafficEstimate: overrides.trafficEstimate ?? 12.3,
		cpc: 1.4,
		rankingUrl: 'https://controlrondas.com/precios',
		sourceProvider: 'dataforseo',
		rawPayloadId: null,
		observedAt: overrides.observedAt ?? new Date('2026-05-09T06:00:00Z'),
	});

describe('QueryRankedKeywordsUseCase', () => {
	let projects: InMemoryProjectRepository;
	let observations: InMemoryRankedKeywordObservationRepository;
	let project: ProjectManagement.Project;
	let useCase: QueryRankedKeywordsUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		observations = new InMemoryRankedKeywordObservationRepository();
		project = aProject({ organizationId: orgId });
		await projects.save(project);
		useCase = new QueryRankedKeywordsUseCase(projects, observations);
	});

	it('returns the latest snapshot mapped to DTO shape', async () => {
		await observations.saveAll([
			buildObs({ projectId: project.id, keyword: 'a', trafficEstimate: 10 }),
			buildObs({ projectId: project.id, keyword: 'b', trafficEstimate: 50 }),
		]);
		const result = await useCase.execute({
			projectId: project.id,
			targetDomain: 'controlrondas.com',
		});
		expect(result.rows).toHaveLength(2);
		// Default order: highest trafficEstimate first.
		expect(result.rows[0]?.keyword).toBe('b');
		expect(typeof result.rows[0]?.observedAt).toBe('string');
	});

	it('respects the minVolume filter', async () => {
		await observations.saveAll([
			buildObs({ projectId: project.id, keyword: 'low', searchVolume: 10 }),
			buildObs({ projectId: project.id, keyword: 'high', searchVolume: 1000 }),
		]);
		const result = await useCase.execute({
			projectId: project.id,
			targetDomain: 'controlrondas.com',
			minVolume: 100,
		});
		expect(result.rows.map((r) => r.keyword)).toEqual(['high']);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({
				projectId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
				targetDomain: 'controlrondas.com',
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
