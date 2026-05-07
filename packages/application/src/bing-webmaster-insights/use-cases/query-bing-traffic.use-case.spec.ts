import { BingWebmasterInsights, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryBingTrafficUseCase } from './query-bing-traffic.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const PROPERTY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as BingWebmasterInsights.BingPropertyId;
const OTHER_PROPERTY_ID =
	'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab' as Uuid as BingWebmasterInsights.BingPropertyId;

class InMemoryPropertyRepo implements BingWebmasterInsights.BingPropertyRepository {
	readonly store = new Map<string, BingWebmasterInsights.BingProperty>();
	async save(p: BingWebmasterInsights.BingProperty): Promise<void> {
		this.store.set(p.id, p);
	}
	async findById(
		id: BingWebmasterInsights.BingPropertyId,
	): Promise<BingWebmasterInsights.BingProperty | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndSite(): Promise<BingWebmasterInsights.BingProperty | null> {
		return null;
	}
	async listForProject(): Promise<readonly BingWebmasterInsights.BingProperty[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly BingWebmasterInsights.BingProperty[]> {
		return [];
	}
}

class InMemoryObsRepo implements BingWebmasterInsights.BingTrafficObservationRepository {
	readonly rows: BingWebmasterInsights.BingTrafficObservation[] = [];
	async saveAll(
		observations: readonly BingWebmasterInsights.BingTrafficObservation[],
	): Promise<{ inserted: number }> {
		this.rows.push(...observations);
		return { inserted: observations.length };
	}
	async listForProperty(
		propertyId: BingWebmasterInsights.BingPropertyId,
		filter: { from: string; to: string },
	): Promise<readonly BingWebmasterInsights.BingTrafficObservation[]> {
		return this.rows
			.filter((r) => r.bingPropertyId === propertyId)
			.filter((r) => r.observedDate >= filter.from && r.observedDate <= filter.to)
			.sort((a, b) => a.observedDate.localeCompare(b.observedDate));
	}
	async listLatestForProject(): Promise<readonly BingWebmasterInsights.BingTrafficObservation[]> {
		return [];
	}
}

const buildObservation = (overrides: {
	observedDate: string;
	clicks?: number;
	bingPropertyId?: BingWebmasterInsights.BingPropertyId;
}): BingWebmasterInsights.BingTrafficObservation =>
	BingWebmasterInsights.BingTrafficObservation.record({
		bingPropertyId: overrides.bingPropertyId ?? PROPERTY_ID,
		projectId: PROJECT_ID,
		observedDate: overrides.observedDate,
		metrics: BingWebmasterInsights.BingTrafficMetrics.create({
			clicks: overrides.clicks ?? 100,
			impressions: 2000,
			avgClickPosition: 4.5,
			avgImpressionPosition: 12.3,
		}),
		rawPayloadId: null,
	});

describe('QueryBingTrafficUseCase', () => {
	let propRepo: InMemoryPropertyRepo;
	let obsRepo: InMemoryObsRepo;
	let useCase: QueryBingTrafficUseCase;

	beforeEach(async () => {
		propRepo = new InMemoryPropertyRepo();
		obsRepo = new InMemoryObsRepo();
		useCase = new QueryBingTrafficUseCase(propRepo, obsRepo);
		await propRepo.save(
			BingWebmasterInsights.BingProperty.link({
				id: PROPERTY_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				siteUrl: 'https://example.com/',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
	});

	it('returns observations in the date window for the property', async () => {
		await obsRepo.saveAll([
			buildObservation({ observedDate: '2026-05-01', clicks: 100 }),
			buildObservation({ observedDate: '2026-05-02', clicks: 50 }),
		]);

		const result = await useCase.execute({
			bingPropertyId: PROPERTY_ID,
			from: '2026-05-01',
			to: '2026-05-02',
		});

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.clicks)).toEqual([100, 50]);
	});

	it('throws NotFoundError when the property does not exist', async () => {
		await expect(
			useCase.execute({ bingPropertyId: 'missing', from: '2026-05-01', to: '2026-05-02' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('honours the date window — observations outside are excluded', async () => {
		await obsRepo.saveAll([
			buildObservation({ observedDate: '2026-04-30' }),
			buildObservation({ observedDate: '2026-05-01' }),
			buildObservation({ observedDate: '2026-05-03' }),
		]);

		const result = await useCase.execute({
			bingPropertyId: PROPERTY_ID,
			from: '2026-05-01',
			to: '2026-05-02',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.observedDate).toBe('2026-05-01');
	});

	it('scopes results to the requested property', async () => {
		await propRepo.save(
			BingWebmasterInsights.BingProperty.link({
				id: OTHER_PROPERTY_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				siteUrl: 'https://other.com/',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
		await obsRepo.saveAll([
			buildObservation({ observedDate: '2026-05-01', clicks: 100 }),
			buildObservation({
				observedDate: '2026-05-01',
				clicks: 999,
				bingPropertyId: OTHER_PROPERTY_ID,
			}),
		]);

		const result = await useCase.execute({
			bingPropertyId: PROPERTY_ID,
			from: '2026-05-01',
			to: '2026-05-01',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.clicks).toBe(100);
	});
});
