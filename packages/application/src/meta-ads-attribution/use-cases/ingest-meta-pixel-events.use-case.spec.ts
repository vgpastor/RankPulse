import type { IdentityAccess, MetaAdsAttribution, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestMetaPixelEventsUseCase } from './ingest-meta-pixel-events.use-case.js';
import { LinkMetaPixelUseCase } from './link-meta-pixel.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

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

class InMemoryEventDailyRepo implements MetaAdsAttribution.MetaPixelEventDailyRepository {
	readonly store = new Map<string, MetaAdsAttribution.MetaPixelEventDaily>();
	async saveAll(rows: readonly MetaAdsAttribution.MetaPixelEventDaily[]): Promise<{ inserted: number }> {
		let inserted = 0;
		for (const r of rows) {
			const k = `${r.metaPixelId}|${r.observedDate}|${r.eventName}`;
			if (this.store.has(k)) continue;
			this.store.set(k, r);
			inserted += 1;
		}
		return { inserted };
	}
	async listForPixel(): Promise<readonly MetaAdsAttribution.MetaPixelEventDaily[]> {
		return [...this.store.values()];
	}
}

describe('IngestMetaPixelEventsUseCase', () => {
	let pixelRepo: InMemoryPixelRepo;
	let eventRepo: InMemoryEventDailyRepo;
	let events: RecordingEventPublisher;
	let pixelId: string;

	beforeEach(async () => {
		pixelRepo = new InMemoryPixelRepo();
		eventRepo = new InMemoryEventDailyRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkMetaPixelUseCase(
			pixelRepo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['mp-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			pixelHandle: '123456789012',
		});
		pixelId = result.metaPixelId;
		events.clear();
	});

	const buildUseCase = () =>
		new IngestMetaPixelEventsUseCase(pixelRepo, eventRepo, events, new FakeClock('2026-05-04T11:00:00Z'));

	it('persists rows and publishes a batch summary with totals on first ingest', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute({
			metaPixelId: pixelId,
			rawPayloadId: null,
			rows: [
				{ observedDate: '2026-05-01', eventName: 'PageView', count: 1234, valueSum: 0 },
				{ observedDate: '2026-05-01', eventName: 'Purchase', count: 5, valueSum: 234.5 },
			],
		});
		expect(result.ingested).toBe(2);
		const [evt] = events.published();
		expect(evt?.type).toBe('MetaPixelEventsBatchIngested');
		const summary = evt as MetaAdsAttribution.MetaPixelEventsBatchIngested;
		expect(summary.totalEvents).toBe(1239);
		expect(summary.totalValueSum).toBe(234.5);
	});

	it('reports zero ingested on a re-fetch of the same window (idempotent on natural key)', async () => {
		const useCase = buildUseCase();
		const row = { observedDate: '2026-05-01', eventName: 'PageView', count: 100, valueSum: 0 };
		await useCase.execute({ metaPixelId: pixelId, rawPayloadId: null, rows: [row] });
		events.clear();
		const second = await useCase.execute({ metaPixelId: pixelId, rawPayloadId: null, rows: [row] });
		expect(second.ingested).toBe(0);
		expect(eventRepo.store.size).toBe(1);
	});

	it('accepts negative valueSum (refund / chargeback events)', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute({
			metaPixelId: pixelId,
			rawPayloadId: null,
			rows: [{ observedDate: '2026-05-01', eventName: 'Purchase', count: 1, valueSum: -49.99 }],
		});
		expect(result.ingested).toBe(1);
	});

	it('throws NotFoundError when the pixel does not exist', async () => {
		const useCase = buildUseCase();
		await expect(
			useCase.execute({
				metaPixelId: 'missing',
				rawPayloadId: null,
				rows: [{ observedDate: '2026-05-01', eventName: 'PageView', count: 1, valueSum: 0 }],
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('returns 0 and does not publish on an empty batch', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute({
			metaPixelId: pixelId,
			rawPayloadId: null,
			rows: [],
		});
		expect(result.ingested).toBe(0);
		expect(events.published()).toEqual([]);
	});
});
