import { type IdentityAccess, ProjectManagement, type SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryLostOpportunityUseCase } from './query-lost-opportunity.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class FakeCockpit implements SearchConsoleInsights.GscCockpitReadModel {
	rows: SearchConsoleInsights.QueryAggregateRow[] = [];
	async aggregateByQuery(): Promise<readonly SearchConsoleInsights.QueryAggregateRow[]> {
		return this.rows;
	}
	async weeklyClicksByQuery(): Promise<readonly SearchConsoleInsights.WeeklyClicksByQueryRow[]> {
		return [];
	}
	async dailyTotalsForProject(): Promise<readonly SearchConsoleInsights.DailyClicksImpressionsRow[]> {
		return [];
	}
}

describe('QueryLostOpportunityUseCase', () => {
	let projects: InMemoryProjectRepository;
	let cockpit: FakeCockpit;
	let useCase: QueryLostOpportunityUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		cockpit = new FakeCockpit();
		useCase = new QueryLostOpportunityUseCase(projects, cockpit);
		await projects.save(
			ProjectManagement.Project.create({
				id: PROJECT_ID,
				organizationId: ORG_ID,
				portfolioId: null,
				name: 'PatrolTech',
				primaryDomain: ProjectManagement.DomainName.create('controlrondas.com'),
				now: new Date('2026-04-01T00:00:00Z'),
			}),
		);
	});

	it('skips queries already at or above the target position', async () => {
		cockpit.rows = [
			{ query: 'already-top', totalImpressions: 1000, totalClicks: 250, avgPosition: 2, bestPage: null },
			{ query: 'pos-7', totalImpressions: 1000, totalClicks: 30, avgPosition: 7, bestPage: null },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows.map((r) => r.query)).toEqual(['pos-7']);
	});

	it('computes lostClicks ≈ impressions × (CTR_target - CTR_current)/100', async () => {
		// pos 7 → CTR ~3.5%, target pos 3 → CTR 11% ⇒ Δ = 7.5% ⇒ lostClicks ≈ 75
		cockpit.rows = [
			{ query: 'pos-7', totalImpressions: 1000, totalClicks: 30, avgPosition: 7, bestPage: '/p' },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows[0]?.lostClicks).toBe(75);
	});

	it('sorts rows by lostClicks descending and reports a totalLostClicks figure', async () => {
		cockpit.rows = [
			{ query: 'small', totalImpressions: 200, totalClicks: 0, avgPosition: 7, bestPage: null },
			{ query: 'big', totalImpressions: 5000, totalClicks: 0, avgPosition: 7, bestPage: null },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows.map((r) => r.query)).toEqual(['big', 'small']);
		expect(result.totalLostClicks).toBeGreaterThan(0);
	});

	it('honours the limit parameter', async () => {
		cockpit.rows = Array.from({ length: 100 }, (_, i) => ({
			query: `kw-${i}`,
			totalImpressions: 1000 - i,
			totalClicks: 0,
			avgPosition: 8,
			bestPage: null,
		}));
		const result = await useCase.execute({ projectId: PROJECT_ID, limit: 5 });
		expect(result.rows).toHaveLength(5);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: '99999999-9999-9999-9999-999999999999' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
