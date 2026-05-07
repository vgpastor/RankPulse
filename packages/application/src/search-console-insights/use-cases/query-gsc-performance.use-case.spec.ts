import { type IdentityAccess, type ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { InMemoryGscPerformanceObservationRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryGscPerformanceUseCase } from './query-gsc-performance.use-case.js';

const propertyId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as SearchConsoleInsights.GscPropertyId;
const otherPropertyId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab' as Uuid as SearchConsoleInsights.GscPropertyId;
const projectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as ProjectManagement.ProjectId;
const orgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;

class PropertyRepo implements SearchConsoleInsights.GscPropertyRepository {
	store = new Map<string, SearchConsoleInsights.GscProperty>();
	async save(p: SearchConsoleInsights.GscProperty): Promise<void> {
		this.store.set(p.id, p);
	}
	async findById(id: SearchConsoleInsights.GscPropertyId): Promise<SearchConsoleInsights.GscProperty | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndSite(): Promise<SearchConsoleInsights.GscProperty | null> {
		return null;
	}
	async listForProject(): Promise<readonly SearchConsoleInsights.GscProperty[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly SearchConsoleInsights.GscProperty[]> {
		return [];
	}
}

const buildObservation = (overrides: {
	observedAt: Date;
	query: string | null;
	page: string | null;
	country: string | null;
	device: string | null;
	id?: string;
	gscPropertyId?: SearchConsoleInsights.GscPropertyId;
}): SearchConsoleInsights.GscPerformanceObservation =>
	SearchConsoleInsights.GscPerformanceObservation.record({
		id: (overrides.id ??
			'dddddddd-dddd-dddd-dddd-dddddddddddd') as Uuid as SearchConsoleInsights.GscObservationId,
		gscPropertyId: overrides.gscPropertyId ?? propertyId,
		projectId,
		observedAt: overrides.observedAt,
		query: overrides.query,
		page: overrides.page,
		country: overrides.country,
		device: overrides.device,
		metrics: SearchConsoleInsights.PerformanceMetrics.create({
			clicks: 1,
			impressions: 10,
			ctr: 0.1,
			position: 5,
		}),
		rawPayloadId: null,
	});

describe('QueryGscPerformanceUseCase', () => {
	let propertyRepo: PropertyRepo;
	let obsRepo: InMemoryGscPerformanceObservationRepository;
	let useCase: QueryGscPerformanceUseCase;

	beforeEach(async () => {
		propertyRepo = new PropertyRepo();
		obsRepo = new InMemoryGscPerformanceObservationRepository();
		await propertyRepo.save(
			SearchConsoleInsights.GscProperty.link({
				id: propertyId,
				organizationId: orgId,
				projectId,
				siteUrl: 'https://controlrondas.com/',
				propertyType: SearchConsoleInsights.GscPropertyTypes.URL_PREFIX,
				credentialId: null,
				now: new Date('2026-04-01T00:00:00Z'),
			}),
		);
		useCase = new QueryGscPerformanceUseCase(propertyRepo, obsRepo);
	});

	// Regression for #77: an unfiltered request was returning [] because the
	// repo treated `null`/`undefined` as "filter for empty string".
	it('returns all observations in the date window when no dimension filter is supplied', async () => {
		await obsRepo.saveAll([
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				observedAt: new Date('2026-05-01T00:00:00Z'),
				query: 'control de rondas',
				page: 'https://controlrondas.com/',
				country: 'esp',
				device: 'desktop',
			}),
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				observedAt: new Date('2026-05-02T00:00:00Z'),
				query: 'app rondas',
				page: 'https://controlrondas.com/app',
				country: 'mex',
				device: 'mobile',
			}),
		]);
		const result = await useCase.execute({
			gscPropertyId: propertyId,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});
		expect(result).toHaveLength(2);
		expect(result.map((p) => p.query)).toEqual(['control de rondas', 'app rondas']);
	});

	it('filters by exact query when supplied', async () => {
		await obsRepo.saveAll([
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				observedAt: new Date('2026-05-01T00:00:00Z'),
				query: 'control de rondas',
				page: null,
				country: null,
				device: null,
			}),
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				observedAt: new Date('2026-05-02T00:00:00Z'),
				query: 'app rondas',
				page: null,
				country: null,
				device: null,
			}),
		]);
		const result = await useCase.execute({
			gscPropertyId: propertyId,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
			query: 'app rondas',
		});
		expect(result).toHaveLength(1);
		expect(result[0]?.query).toBe('app rondas');
	});

	it('treats explicit empty string as "filter for absent dimension"', async () => {
		await obsRepo.saveAll([
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				observedAt: new Date('2026-05-01T00:00:00Z'),
				query: 'control de rondas',
				page: null,
				country: null,
				device: null,
			}),
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				observedAt: new Date('2026-05-02T00:00:00Z'),
				query: null, // GSC API didn't return the query dimension on this row
				page: null,
				country: null,
				device: null,
			}),
		]);
		const result = await useCase.execute({
			gscPropertyId: propertyId,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
			query: '',
		});
		expect(result).toHaveLength(1);
		expect(result[0]?.query).toBe(null);
	});

	it('honours the date window', async () => {
		await obsRepo.saveAll([
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				observedAt: new Date('2026-04-15T00:00:00Z'),
				query: 'old',
				page: null,
				country: null,
				device: null,
			}),
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				observedAt: new Date('2026-05-15T00:00:00Z'),
				query: 'new',
				page: null,
				country: null,
				device: null,
			}),
		]);
		const result = await useCase.execute({
			gscPropertyId: propertyId,
			from: new Date('2026-05-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});
		expect(result).toHaveLength(1);
		expect(result[0]?.query).toBe('new');
	});

	it('scopes results to the requested property', async () => {
		await obsRepo.saveAll([
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				observedAt: new Date('2026-05-01T00:00:00Z'),
				query: 'mine',
				page: null,
				country: null,
				device: null,
			}),
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				observedAt: new Date('2026-05-01T00:00:00Z'),
				query: 'theirs',
				page: null,
				country: null,
				device: null,
				gscPropertyId: otherPropertyId,
			}),
		]);
		const result = await useCase.execute({
			gscPropertyId: propertyId,
			from: new Date('2026-04-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});
		expect(result).toHaveLength(1);
		expect(result[0]?.query).toBe('mine');
	});

	it('throws NotFoundError when the property does not exist', async () => {
		await expect(
			useCase.execute({
				gscPropertyId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
				from: new Date('2026-04-01T00:00:00Z'),
				to: new Date('2026-05-31T00:00:00Z'),
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
