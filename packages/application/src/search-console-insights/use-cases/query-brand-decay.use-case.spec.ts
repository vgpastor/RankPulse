import { type IdentityAccess, ProjectManagement, type SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryBrandDecayUseCase } from './query-brand-decay.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

const WEEK_A = new Date('2026-04-27T00:00:00Z'); // earlier ISO week
const WEEK_B = new Date('2026-05-04T00:00:00Z'); // later ISO week

class FakeCockpit implements SearchConsoleInsights.GscCockpitReadModel {
	weekly: SearchConsoleInsights.WeeklyClicksByQueryRow[] = [];
	async aggregateByQuery(): Promise<readonly SearchConsoleInsights.QueryAggregateRow[]> {
		return [];
	}
	async weeklyClicksByQuery(): Promise<readonly SearchConsoleInsights.WeeklyClicksByQueryRow[]> {
		return this.weekly;
	}
	async dailyTotalsForProject(): Promise<readonly SearchConsoleInsights.DailyClicksImpressionsRow[]> {
		return [];
	}
}

describe('QueryBrandDecayUseCase', () => {
	let projects: InMemoryProjectRepository;
	let cockpit: FakeCockpit;
	let useCase: QueryBrandDecayUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		cockpit = new FakeCockpit();
		useCase = new QueryBrandDecayUseCase(projects, cockpit);
		await projects.save(
			ProjectManagement.Project.create({
				id: PROJECT_ID,
				organizationId: ORG_ID,
				portfolioId: null,
				name: 'PatrolTech',
				primaryDomain: ProjectManagement.DomainName.create('patroltech.com'),
				now: new Date('2026-04-01T00:00:00Z'),
			}),
		);
	});

	it('classifies queries that contain the brand token as branded', async () => {
		cockpit.weekly = [
			{ weekStart: WEEK_B, query: 'patroltech login', clicks: 100, impressions: 500 },
			{ weekStart: WEEK_B, query: 'guard tour software', clicks: 30, impressions: 800 },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.brandTokens).toEqual(expect.arrayContaining(['patroltech']));
		expect(result.branded.clicksThisWeek).toBe(100);
		expect(result.nonBranded.clicksThisWeek).toBe(30);
	});

	it('flags alert when non-branded clicks dropped ≥ dropAlertPct WoW', async () => {
		cockpit.weekly = [
			{ weekStart: WEEK_A, query: 'guard tour software', clicks: 100, impressions: 1000 },
			{ weekStart: WEEK_B, query: 'guard tour software', clicks: 70, impressions: 1000 },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID, dropAlertPct: 20 });
		expect(result.nonBranded.deltaPct).toBe(-30);
		expect(result.alert).toBe(true);
		expect(result.alertReason).toBe('no-brand-decay');
	});

	it('does NOT flag alert when non-branded only dropped less than dropAlertPct', async () => {
		cockpit.weekly = [
			{ weekStart: WEEK_A, query: 'guard tour software', clicks: 100, impressions: 1000 },
			{ weekStart: WEEK_B, query: 'guard tour software', clicks: 90, impressions: 1000 },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID, dropAlertPct: 20 });
		expect(result.alert).toBe(false);
		expect(result.alertReason).toBeNull();
	});

	it('returns null deltaPct when no prior week data is present', async () => {
		cockpit.weekly = [{ weekStart: WEEK_B, query: 'guard tour software', clicks: 50, impressions: 800 }];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.nonBranded.deltaPct).toBeNull();
		expect(result.alert).toBe(false);
	});

	it('exposes top-5 queries per bucket sorted by clicks desc', async () => {
		cockpit.weekly = [
			{ weekStart: WEEK_B, query: 'patroltech a', clicks: 50, impressions: 100 },
			{ weekStart: WEEK_B, query: 'patroltech b', clicks: 90, impressions: 200 },
			{ weekStart: WEEK_B, query: 'guard tour', clicks: 200, impressions: 1000 },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.branded.topQueries.map((q) => q.query)).toEqual(['patroltech b', 'patroltech a']);
		expect(result.nonBranded.topQueries[0]?.query).toBe('guard tour');
	});

	it('throws NotFoundError for unknown project', async () => {
		await expect(
			useCase.execute({ projectId: '99999999-9999-9999-9999-999999999999' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
