import { type IdentityAccess, ProjectManagement, type SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryCtrAnomaliesUseCase } from './query-ctr-anomalies.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class FakeCockpit implements SearchConsoleInsights.GscCockpitReadModel {
	rows: SearchConsoleInsights.QueryAggregateRow[] = [];
	requested: { windowDays: number; minImpressions: number | undefined } | null = null;
	async aggregateByQuery(
		_projectId: ProjectManagement.ProjectId,
		windowDays: number,
		options?: { minImpressions?: number; limit?: number },
	): Promise<readonly SearchConsoleInsights.QueryAggregateRow[]> {
		this.requested = { windowDays, minImpressions: options?.minImpressions };
		return this.rows;
	}
	async weeklyClicksByQuery(): Promise<readonly SearchConsoleInsights.WeeklyClicksByQueryRow[]> {
		return [];
	}
	async dailyTotalsForProject(): Promise<readonly SearchConsoleInsights.DailyClicksImpressionsRow[]> {
		return [];
	}
}

describe('QueryCtrAnomaliesUseCase', () => {
	let projects: InMemoryProjectRepository;
	let cockpit: FakeCockpit;
	let useCase: QueryCtrAnomaliesUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		cockpit = new FakeCockpit();
		useCase = new QueryCtrAnomaliesUseCase(projects, cockpit);
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

	it('returns only rows with zero clicks AND position ≤ 30', async () => {
		cockpit.rows = [
			{ query: 'no-clicks-low-pos', totalImpressions: 500, totalClicks: 0, avgPosition: 12, bestPage: '/a' },
			{ query: 'has-clicks', totalImpressions: 500, totalClicks: 5, avgPosition: 12, bestPage: '/b' },
			{ query: 'too-deep', totalImpressions: 500, totalClicks: 0, avgPosition: 45, bestPage: '/c' },
			{ query: 'top-3-no-clicks', totalImpressions: 500, totalClicks: 0, avgPosition: 2.5, bestPage: '/d' },
		];

		const result = await useCase.execute({ projectId: PROJECT_ID });

		expect(result.anomalies.map((a) => a.query)).toEqual(['no-clicks-low-pos', 'top-3-no-clicks']);
	});

	it('sorts anomalies by impression volume descending', async () => {
		cockpit.rows = [
			{ query: 'small', totalImpressions: 100, totalClicks: 0, avgPosition: 15, bestPage: null },
			{ query: 'big', totalImpressions: 5000, totalClicks: 0, avgPosition: 15, bestPage: null },
			{ query: 'mid', totalImpressions: 1000, totalClicks: 0, avgPosition: 15, bestPage: null },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.anomalies.map((a) => a.query)).toEqual(['big', 'mid', 'small']);
	});

	it('passes minImpressions through to the read model with default 50', async () => {
		await useCase.execute({ projectId: PROJECT_ID });
		expect(cockpit.requested?.minImpressions).toBe(50);
	});

	it('honours custom minImpressions', async () => {
		await useCase.execute({ projectId: PROJECT_ID, minImpressions: 200 });
		expect(cockpit.requested?.minImpressions).toBe(200);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: '99999999-9999-9999-9999-999999999999' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
