import { type IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryCompetitorRepository, InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryCompetitorActivityUseCase } from './query-competitor-activity.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const COMP_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as ProjectManagement.CompetitorId;
const COMP_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as ProjectManagement.CompetitorId;

class FakeActivityRepo implements ProjectManagement.CompetitorActivityObservationRepository {
	rollups: ProjectManagement.CompetitorActivityRollupRow[] = [];
	async save(): Promise<void> {}
	async rollupForProject(): Promise<readonly ProjectManagement.CompetitorActivityRollupRow[]> {
		return this.rollups;
	}
}

const NOW = new Date('2026-05-09T00:00:00Z');
const PRIOR = new Date('2026-05-02T00:00:00Z');

describe('QueryCompetitorActivityUseCase', () => {
	let projects: InMemoryProjectRepository;
	let competitors: InMemoryCompetitorRepository;
	let activity: FakeActivityRepo;
	let useCase: QueryCompetitorActivityUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		competitors = new InMemoryCompetitorRepository();
		activity = new FakeActivityRepo();
		useCase = new QueryCompetitorActivityUseCase(projects, competitors, activity);
		await projects.save(
			ProjectManagement.Project.create({
				id: PROJECT_ID,
				organizationId: ORG_ID,
				portfolioId: null,
				name: 'PatrolTech',
				primaryDomain: ProjectManagement.DomainName.create('patroltech.com'),
				now: new Date('2026-04-01T10:00:00Z'),
			}),
		);
		await competitors.save(
			ProjectManagement.Competitor.add({
				id: COMP_A,
				projectId: PROJECT_ID,
				domain: ProjectManagement.DomainName.create('silvertrac.com'),
				label: 'Silvertrac',
				now: new Date('2026-04-15T10:00:00Z'),
			}),
		);
		await competitors.save(
			ProjectManagement.Competitor.add({
				id: COMP_B,
				projectId: PROJECT_ID,
				domain: ProjectManagement.DomainName.create('quietrival.com'),
				label: 'QuietRival',
				now: new Date('2026-04-15T10:00:00Z'),
			}),
		);
	});

	it('returns empty rows when the project has no competitors', async () => {
		const empty = new InMemoryCompetitorRepository();
		const useCaseEmpty = new QueryCompetitorActivityUseCase(projects, empty, activity);
		const result = await useCaseEmpty.execute({ projectId: PROJECT_ID });
		expect(result.rows).toHaveLength(0);
		expect(result.maxScore).toBe(0);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: '99999999-9999-9999-9999-999999999999' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('returns rows for every competitor (even those without observations)', async () => {
		activity.rollups = [];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows).toHaveLength(2);
		expect(result.rows.every((r) => r.activityScore === 0)).toBe(true);
		expect(result.rows.every((r) => r.wayback === null && r.backlinks === null)).toBe(true);
	});

	it('computes wayback delta and exposes the latest snapshot', async () => {
		activity.rollups = [
			{
				competitorId: COMP_A,
				latestObservedAt: NOW,
				latestWayback: { snapshotCount: 50, latestSnapshotAt: NOW, observedAt: NOW },
				priorWayback: { snapshotCount: 30, observedAt: PRIOR },
				latestBacklinks: null,
				priorBacklinks: null,
			},
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		const compA = result.rows.find((r) => r.competitorId === COMP_A);
		expect(compA?.wayback).toEqual({
			snapshotCount: 50,
			latestSnapshotAt: NOW.toISOString(),
			observedAt: NOW.toISOString(),
			deltaSnapshots: 20,
		});
	});

	it('clamps negative deltas at zero before scoring (competitor pruning content does not earn activity score)', async () => {
		activity.rollups = [
			{
				competitorId: COMP_A,
				latestObservedAt: NOW,
				latestWayback: { snapshotCount: 10, latestSnapshotAt: NOW, observedAt: NOW },
				priorWayback: { snapshotCount: 50, observedAt: PRIOR },
				latestBacklinks: null,
				priorBacklinks: null,
			},
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		const compA = result.rows.find((r) => r.competitorId === COMP_A);
		expect(compA?.activityScore).toBe(0);
		expect(compA?.wayback?.deltaSnapshots).toBe(-40);
	});

	it('normalises across competitors so the most-active hits 100', async () => {
		activity.rollups = [
			{
				competitorId: COMP_A,
				latestObservedAt: NOW,
				latestWayback: { snapshotCount: 100, latestSnapshotAt: NOW, observedAt: NOW },
				priorWayback: { snapshotCount: 50, observedAt: PRIOR },
				latestBacklinks: { totalBacklinks: 1000, referringDomains: 100, observedAt: NOW },
				priorBacklinks: { totalBacklinks: 500, referringDomains: 80, observedAt: PRIOR },
			},
			{
				competitorId: COMP_B,
				latestObservedAt: NOW,
				latestWayback: { snapshotCount: 30, latestSnapshotAt: NOW, observedAt: NOW },
				priorWayback: { snapshotCount: 20, observedAt: PRIOR },
				latestBacklinks: null,
				priorBacklinks: null,
			},
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.maxScore).toBe(100);
		expect(result.rows[0]?.competitorId).toBe(COMP_A);
		expect(result.rows[0]?.activityScore).toBe(100);
		expect(result.rows[1]?.competitorId).toBe(COMP_B);
		expect(result.rows[1]?.activityScore).toBeLessThan(100);
	});
});
