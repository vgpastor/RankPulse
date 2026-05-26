import { type IdentityAccess, type ProjectManagement, RankTracking } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import {
	aProject,
	InMemoryProjectRepository,
	InMemoryRankedKeywordObservationRepository,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QuerySearchDemandTrendUseCase } from './query-search-demand-trend.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;

const buildObs = (
	overrides: Partial<{
		projectId: ProjectManagement.ProjectId;
		targetDomain: string;
		keyword: string;
		searchVolume: number | null;
		observedAt: Date;
	}>,
): RankTracking.RankedKeywordObservation =>
	RankTracking.RankedKeywordObservation.record({
		id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as RankTracking.RankedKeywordObservationId,
		projectId: overrides.projectId ?? ('p' as Uuid as ProjectManagement.ProjectId),
		targetDomain: overrides.targetDomain ?? 'patroltech.online',
		keyword: overrides.keyword ?? 'guard tour software',
		country: 'US',
		language: 'en',
		position: 5,
		searchVolume: overrides.searchVolume ?? 100,
		keywordDifficulty: 22,
		trafficEstimate: 12.3,
		cpc: 1.4,
		rankingUrl: 'https://patroltech.online/',
		sourceProvider: 'dataforseo',
		rawPayloadId: null,
		observedAt: overrides.observedAt ?? new Date(),
	});

describe('QuerySearchDemandTrendUseCase', () => {
	let projects: InMemoryProjectRepository;
	let observations: InMemoryRankedKeywordObservationRepository;
	let useCase: QuerySearchDemandTrendUseCase;
	let project: ProjectManagement.Project;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		observations = new InMemoryRankedKeywordObservationRepository();
		useCase = new QuerySearchDemandTrendUseCase(projects, observations);
		project = aProject({ organizationId: ORG_ID });
		await projects.save(project);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: 'nonexistent' as Uuid as ProjectManagement.ProjectId }),
		).rejects.toThrow(NotFoundError);
	});

	it('returns zeros + empty points when the project has no observations', async () => {
		const result = await useCase.execute({ projectId: project.id });
		expect(result.points).toEqual([]);
		expect(result.latestVolume).toBe(0);
		expect(result.previousVolume).toBe(0);
		expect(result.deltaPct).toBeNull();
	});

	it('returns one bucket per UTC month with summed search volume', async () => {
		const now = new Date();
		const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
		const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
		await observations.saveAll([
			buildObs({ projectId: project.id, keyword: 'a', searchVolume: 100, observedAt: lastMonth }),
			buildObs({ projectId: project.id, keyword: 'b', searchVolume: 200, observedAt: lastMonth }),
			buildObs({ projectId: project.id, keyword: 'a', searchVolume: 120, observedAt: thisMonth }),
			buildObs({ projectId: project.id, keyword: 'b', searchVolume: 220, observedAt: thisMonth }),
		]);

		const result = await useCase.execute({ projectId: project.id });

		expect(result.points).toHaveLength(2);
		expect(result.points[0]?.totalVolume).toBe(300); // last month
		expect(result.points[1]?.totalVolume).toBe(340); // this month
		expect(result.latestVolume).toBe(340);
		expect(result.previousVolume).toBe(300);
		expect(result.deltaPct).toBeCloseTo(13.3, 1);
	});

	it('keeps the LATEST snapshot per (target_domain, keyword) inside a bucket — no double counting', async () => {
		const now = new Date();
		const day1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
		const day15 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
		await observations.saveAll([
			// Same keyword re-observed twice in the same month — only the latest counts.
			buildObs({ projectId: project.id, keyword: 'k1', searchVolume: 50, observedAt: day1 }),
			buildObs({ projectId: project.id, keyword: 'k1', searchVolume: 80, observedAt: day15 }),
		]);

		const result = await useCase.execute({ projectId: project.id });

		expect(result.points).toHaveLength(1);
		expect(result.points[0]?.totalVolume).toBe(80);
		expect(result.points[0]?.distinctKeywords).toBe(1);
	});

	it('scopes aggregation to a specific target domain when supplied', async () => {
		const now = new Date();
		const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
		await observations.saveAll([
			buildObs({
				projectId: project.id,
				targetDomain: 'patroltech.online',
				keyword: 'a',
				searchVolume: 500,
				observedAt: thisMonth,
			}),
			buildObs({
				projectId: project.id,
				targetDomain: 'tracktik.com',
				keyword: 'b',
				searchVolume: 9999,
				observedAt: thisMonth,
			}),
		]);

		const result = await useCase.execute({ projectId: project.id, targetDomain: 'patroltech.online' });

		expect(result.points).toHaveLength(1);
		expect(result.points[0]?.totalVolume).toBe(500);
	});

	it('returns deltaPct=null when previousVolume is 0 (no division-by-zero in the API)', async () => {
		const now = new Date();
		const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
		await observations.saveAll([
			buildObs({ projectId: project.id, keyword: 'a', searchVolume: 100, observedAt: thisMonth }),
		]);

		const result = await useCase.execute({ projectId: project.id });

		expect(result.latestVolume).toBe(100);
		expect(result.previousVolume).toBe(0);
		expect(result.deltaPct).toBeNull();
	});

	it('exposes Date.toISOString() on the month field — proves the use case never crashes on a string', async () => {
		// This is the contract that `serialiseTrendForApi` (in the controller)
		// relies on. The use case itself doesn't serialise, but the consumer
		// shape is `b.month.toISOString()` — so `month` MUST be a Date.
		// The drizzle repo has its own spec covering the postgres-js quirk
		// at the boundary; this test guards the use-case contract.
		const now = new Date();
		const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
		await observations.saveAll([
			buildObs({ projectId: project.id, keyword: 'a', searchVolume: 50, observedAt: thisMonth }),
		]);

		const result = await useCase.execute({ projectId: project.id });

		expect(result.points[0]?.month).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
	});
});
