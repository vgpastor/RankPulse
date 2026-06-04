import { type IdentityAccess, ProjectManagement, type SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryGscKeywordPositionsUseCase } from './query-gsc-keyword-positions.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

type FakeRow = Omit<SearchConsoleInsights.QueryAggregateRow, 'siteUrl'> & { siteUrl?: string };

class FakeCockpit implements SearchConsoleInsights.GscCockpitReadModel {
	rows: FakeRow[] = [];
	requested: { windowDays: number; minImpressions: number | undefined } | null = null;
	async aggregateByQuery(
		_p: ProjectManagement.ProjectId,
		windowDays: number,
		options?: { minImpressions?: number; limit?: number },
	): Promise<readonly SearchConsoleInsights.QueryAggregateRow[]> {
		this.requested = { windowDays, minImpressions: options?.minImpressions };
		return this.rows.map((r) => ({ siteUrl: 'sc-domain:controlrondas.com', ...r }));
	}
	async weeklyClicksByQuery(): Promise<readonly SearchConsoleInsights.WeeklyClicksByQueryRow[]> {
		return [];
	}
	async dailyTotalsForProject(): Promise<readonly SearchConsoleInsights.DailyClicksImpressionsRow[]> {
		return [];
	}
}

describe('QueryGscKeywordPositionsUseCase', () => {
	let projects: InMemoryProjectRepository;
	let cockpit: FakeCockpit;
	let useCase: QueryGscKeywordPositionsUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		cockpit = new FakeCockpit();
		useCase = new QueryGscKeywordPositionsUseCase(projects, cockpit);
		await projects.save(
			ProjectManagement.Project.create({
				id: PROJECT_ID,
				organizationId: ORG_ID,
				portfolioId: null,
				name: 'PatrolTech EN',
				primaryDomain: ProjectManagement.DomainName.create('guardtour.app'),
				now: new Date('2026-04-01T00:00:00Z'),
			}),
		);
	});

	it('returns one GSC position per (siteUrl, query) from the aggregate', async () => {
		cockpit.rows = [
			{
				siteUrl: 'sc-domain:guardtour.app',
				query: 'guard tour app',
				totalImpressions: 100,
				totalClicks: 1,
				avgPosition: 24.18,
				bestPage: null,
			},
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows).toEqual([
			{ siteUrl: 'sc-domain:guardtour.app', query: 'guard tour app', position: 24.2 },
		]);
	});

	it('asks the read-model for all impressed queries (minImpressions=1)', async () => {
		await useCase.execute({ projectId: PROJECT_ID });
		expect(cockpit.requested?.minImpressions).toBe(1);
	});

	it('skips rows with non-positive average position', async () => {
		cockpit.rows = [
			{
				siteUrl: 'sc-domain:x.com',
				query: 'q',
				totalImpressions: 10,
				totalClicks: 0,
				avgPosition: 0,
				bestPage: null,
			},
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows).toEqual([]);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: '99999999-9999-9999-9999-999999999999' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
