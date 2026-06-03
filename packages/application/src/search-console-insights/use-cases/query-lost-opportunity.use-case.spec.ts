import { type IdentityAccess, ProjectManagement, type SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryProjectRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryLostOpportunityUseCase } from './query-lost-opportunity.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

type FakeRow = Omit<SearchConsoleInsights.QueryAggregateRow, 'siteUrl'> & { siteUrl?: string };

class FakeCockpit implements SearchConsoleInsights.GscCockpitReadModel {
	rows: FakeRow[] = [];
	async aggregateByQuery(): Promise<readonly SearchConsoleInsights.QueryAggregateRow[]> {
		// Default siteUrl for the single-property cases; multi-property tests
		// set it explicitly per row.
		return this.rows.map((r) => ({ siteUrl: 'sc-domain:controlrondas.com', ...r }));
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

	it('honours the limit parameter (per property)', async () => {
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

	it('does not let a high-volume property mask the opportunities of its siblings', async () => {
		// Regression for #196: a project with several linked GSC properties
		// must surface each property's opportunities. The dominant property
		// (patroltech.online) has many high-lostClicks queries; the sibling
		// (guardtour.app) has a single, smaller one. Under a global top-N the
		// sibling falls off the list entirely.
		const dominant = Array.from({ length: 60 }, (_, i) => ({
			siteUrl: 'sc-domain:patroltech.online',
			query: `brand-kw-${i}`,
			totalImpressions: 1000,
			totalClicks: 0,
			avgPosition: 8,
			bestPage: '/p',
		}));
		const sibling = {
			siteUrl: 'sc-domain:guardtour.app',
			query: 'guard tour',
			totalImpressions: 300,
			totalClicks: 0,
			avgPosition: 8,
			bestPage: 'https://guardtour.app/',
		};
		cockpit.rows = [...dominant, sibling];

		const result = await useCase.execute({ projectId: PROJECT_ID, limit: 50 });

		const siteUrls = new Set(result.rows.map((r) => r.siteUrl));
		expect(siteUrls.has('sc-domain:guardtour.app')).toBe(true);
		expect(siteUrls.has('sc-domain:patroltech.online')).toBe(true);
		// Every row is attributed to a property.
		expect(result.rows.every((r) => typeof r.siteUrl === 'string' && r.siteUrl.length > 0)).toBe(true);
	});

	it('does not blend positions across properties (each row keeps its own siteUrl)', async () => {
		cockpit.rows = [
			{
				siteUrl: 'sc-domain:patroltech.online',
				query: 'guard tour',
				totalImpressions: 500,
				totalClicks: 0,
				avgPosition: 4,
				bestPage: 'https://patroltech.online/',
			},
			{
				siteUrl: 'sc-domain:guardtour.app',
				query: 'guard tour',
				totalImpressions: 500,
				totalClicks: 0,
				avgPosition: 20,
				bestPage: 'https://guardtour.app/',
			},
		];
		const result = await useCase.execute({ projectId: PROJECT_ID });
		// The same query string on two domains stays as two distinct rows —
		// the pos-20 sibling opportunity is NOT diluted by the pos-4 one.
		const sibling = result.rows.find((r) => r.siteUrl === 'sc-domain:guardtour.app');
		expect(sibling?.currentPosition).toBe(20);
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({ projectId: '99999999-9999-9999-9999-999999999999' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
