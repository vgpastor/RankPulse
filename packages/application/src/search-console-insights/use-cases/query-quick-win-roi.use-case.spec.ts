import { type IdentityAccess, ProjectManagement, type SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryQuickWinRoiUseCase } from './query-quick-win-roi.use-case.js';

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
}

describe('QueryQuickWinRoiUseCase', () => {
	let projects: InMemoryProjectRepository;
	let cockpit: FakeCockpit;
	let useCase: QueryQuickWinRoiUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		cockpit = new FakeCockpit();
		useCase = new QueryQuickWinRoiUseCase(projects, cockpit);
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

	it('only emits keywords in positions 11-30', async () => {
		cockpit.rows = [
			{ query: 'top', totalImpressions: 500, totalClicks: 50, avgPosition: 5, bestPage: null },
			{ query: 'edge-11', totalImpressions: 500, totalClicks: 8, avgPosition: 11, bestPage: null },
			{ query: 'edge-30', totalImpressions: 500, totalClicks: 1, avgPosition: 30, bestPage: null },
			{ query: 'too-deep', totalImpressions: 500, totalClicks: 0, avgPosition: 31, bestPage: null },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows.map((r) => r.query).sort()).toEqual(['edge-11', 'edge-30']);
	});

	it('ranks closer-to-page-1 keywords ahead of deeper ones with the same projected gain', async () => {
		cockpit.rows = [
			// Same impressions; pos-12 should outscore pos-28 because the
			// (31 - position) weight is much larger for the closer keyword.
			{ query: 'kw-12', totalImpressions: 1000, totalClicks: 14, avgPosition: 12, bestPage: null },
			{ query: 'kw-28', totalImpressions: 1000, totalClicks: 2, avgPosition: 28, bestPage: null },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows[0]?.query).toBe('kw-12');
	});

	it('skips keywords whose CTR delta is non-positive', async () => {
		// avgPosition < #10 target gives no gain — already filtered earlier
		// but we double-check the 11-30 boundary as well.
		cockpit.rows = [
			{ query: 'pos-10', totalImpressions: 1000, totalClicks: 10, avgPosition: 10, bestPage: null },
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		expect(result.rows).toHaveLength(0);
	});

	it('respects custom limit', async () => {
		cockpit.rows = Array.from({ length: 30 }, (_, i) => ({
			query: `kw-${i}`,
			totalImpressions: 1000,
			totalClicks: 5,
			avgPosition: 12,
			bestPage: null,
		}));
		const result = await useCase.execute({ projectId: PROJECT_ID, limit: 5 });
		expect(result.rows).toHaveLength(5);
	});

	it('throws NotFoundError for unknown project', async () => {
		await expect(
			useCase.execute({ projectId: '99999999-9999-9999-9999-999999999999' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
