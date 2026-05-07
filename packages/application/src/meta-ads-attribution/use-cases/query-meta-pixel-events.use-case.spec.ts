import { type IdentityAccess, MetaAdsAttribution, type ProjectManagement } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryMetaPixelEventsUseCase } from './query-meta-pixel-events.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const PIXEL_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as MetaAdsAttribution.MetaPixelId;
const OTHER_PIXEL_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab' as Uuid as MetaAdsAttribution.MetaPixelId;

class InMemoryPixelRepo implements MetaAdsAttribution.MetaPixelRepository {
	readonly store = new Map<string, MetaAdsAttribution.MetaPixel>();
	async save(p: MetaAdsAttribution.MetaPixel): Promise<void> {
		this.store.set(p.id, p);
	}
	async findById(id: MetaAdsAttribution.MetaPixelId): Promise<MetaAdsAttribution.MetaPixel | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndHandle(): Promise<MetaAdsAttribution.MetaPixel | null> {
		return null;
	}
	async listForProject(): Promise<readonly MetaAdsAttribution.MetaPixel[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly MetaAdsAttribution.MetaPixel[]> {
		return [];
	}
}

class InMemoryEventRepo implements MetaAdsAttribution.MetaPixelEventDailyRepository {
	readonly rows: MetaAdsAttribution.MetaPixelEventDaily[] = [];
	async saveAll(rows: readonly MetaAdsAttribution.MetaPixelEventDaily[]): Promise<{ inserted: number }> {
		this.rows.push(...rows);
		return { inserted: rows.length };
	}
	async listForPixel(
		pixelId: MetaAdsAttribution.MetaPixelId,
		query: { from: string; to: string },
	): Promise<readonly MetaAdsAttribution.MetaPixelEventDaily[]> {
		return this.rows
			.filter((r) => r.metaPixelId === pixelId)
			.filter((r) => r.observedDate >= query.from && r.observedDate <= query.to)
			.sort((a, b) => a.observedDate.localeCompare(b.observedDate));
	}
}

const buildEvent = (overrides: {
	observedDate: string;
	eventName?: string;
	count?: number;
	valueSum?: number;
	metaPixelId?: MetaAdsAttribution.MetaPixelId;
}): MetaAdsAttribution.MetaPixelEventDaily =>
	MetaAdsAttribution.MetaPixelEventDaily.record({
		metaPixelId: overrides.metaPixelId ?? PIXEL_ID,
		projectId: PROJECT_ID,
		observedDate: overrides.observedDate,
		eventName: overrides.eventName ?? 'Purchase',
		stats: MetaAdsAttribution.MetaPixelEventStats.create({
			count: overrides.count ?? 10,
			valueSum: overrides.valueSum ?? 250.5,
		}),
		rawPayloadId: null,
	});

describe('QueryMetaPixelEventsUseCase', () => {
	let pixelRepo: InMemoryPixelRepo;
	let eventRepo: InMemoryEventRepo;
	let useCase: QueryMetaPixelEventsUseCase;

	beforeEach(async () => {
		pixelRepo = new InMemoryPixelRepo();
		eventRepo = new InMemoryEventRepo();
		useCase = new QueryMetaPixelEventsUseCase(pixelRepo, eventRepo);
		await pixelRepo.save(
			MetaAdsAttribution.MetaPixel.link({
				id: PIXEL_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				pixelHandle: '1234567890',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
	});

	it('returns events in window for the pixel', async () => {
		await eventRepo.saveAll([
			buildEvent({ observedDate: '2026-05-01', count: 10, valueSum: 250.5 }),
			buildEvent({ observedDate: '2026-05-02', count: 20, valueSum: 500 }),
		]);

		const result = await useCase.execute({
			metaPixelId: PIXEL_ID,
			from: '2026-05-01',
			to: '2026-05-02',
		});

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.count)).toEqual([10, 20]);
		expect(result[0]?.eventName).toBe('Purchase');
	});

	it('throws NotFoundError when the pixel does not exist', async () => {
		await expect(
			useCase.execute({ metaPixelId: 'missing', from: '2026-05-01', to: '2026-05-02' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('exposes both event count and aggregate valueSum', async () => {
		await eventRepo.saveAll([
			buildEvent({ observedDate: '2026-05-01', count: 5, valueSum: 100 }),
			buildEvent({
				observedDate: '2026-05-01',
				count: 3,
				valueSum: 50,
				eventName: 'AddToCart',
			}),
		]);

		const result = await useCase.execute({
			metaPixelId: PIXEL_ID,
			from: '2026-05-01',
			to: '2026-05-01',
		});

		expect(result).toHaveLength(2);
		const purchase = result.find((r) => r.eventName === 'Purchase');
		expect(purchase?.valueSum).toBe(100);
		const add = result.find((r) => r.eventName === 'AddToCart');
		expect(add?.valueSum).toBe(50);
	});

	it('scopes results to the requested pixel', async () => {
		await pixelRepo.save(
			MetaAdsAttribution.MetaPixel.link({
				id: OTHER_PIXEL_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				pixelHandle: '9999999999',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
		await eventRepo.saveAll([
			buildEvent({ observedDate: '2026-05-01', count: 10 }),
			buildEvent({
				observedDate: '2026-05-01',
				count: 999,
				metaPixelId: OTHER_PIXEL_ID,
			}),
		]);

		const result = await useCase.execute({
			metaPixelId: PIXEL_ID,
			from: '2026-05-01',
			to: '2026-05-01',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.count).toBe(10);
	});
});
