import type { BingWebmasterInsights, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestBingTrafficUseCase } from './ingest-bing-traffic.use-case.js';
import { LinkBingPropertyUseCase } from './link-bing-property.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryPropertyRepo implements BingWebmasterInsights.BingPropertyRepository {
	readonly store = new Map<string, BingWebmasterInsights.BingProperty>();
	readonly bySite = new Map<string, BingWebmasterInsights.BingProperty>();
	async save(p: BingWebmasterInsights.BingProperty): Promise<void> {
		this.store.set(p.id, p);
		this.bySite.set(`${p.projectId}|${p.siteUrl}`, p);
	}
	async findById(
		id: BingWebmasterInsights.BingPropertyId,
	): Promise<BingWebmasterInsights.BingProperty | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndSite(
		projectId: ProjectManagement.ProjectId,
		siteUrl: string,
	): Promise<BingWebmasterInsights.BingProperty | null> {
		return this.bySite.get(`${projectId}|${siteUrl}`) ?? null;
	}
	async listForProject(): Promise<readonly BingWebmasterInsights.BingProperty[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly BingWebmasterInsights.BingProperty[]> {
		return [];
	}
}

class InMemoryObsRepo implements BingWebmasterInsights.BingTrafficObservationRepository {
	readonly store = new Map<string, BingWebmasterInsights.BingTrafficObservation>();
	async saveAll(
		observations: readonly BingWebmasterInsights.BingTrafficObservation[],
	): Promise<{ inserted: number }> {
		let inserted = 0;
		for (const o of observations) {
			const k = `${o.bingPropertyId}|${o.observedDate}`;
			if (this.store.has(k)) continue;
			this.store.set(k, o);
			inserted += 1;
		}
		return { inserted };
	}
	async listForProperty(): Promise<readonly BingWebmasterInsights.BingTrafficObservation[]> {
		return [...this.store.values()];
	}
	async listLatestForProject(): Promise<readonly BingWebmasterInsights.BingTrafficObservation[]> {
		return [];
	}
}

describe('IngestBingTrafficUseCase', () => {
	let propRepo: InMemoryPropertyRepo;
	let obsRepo: InMemoryObsRepo;
	let events: RecordingEventPublisher;
	let propertyId: string;

	beforeEach(async () => {
		propRepo = new InMemoryPropertyRepo();
		obsRepo = new InMemoryObsRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkBingPropertyUseCase(
			propRepo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['bing-prop-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			siteUrl: 'https://example.com/',
		});
		propertyId = result.bingPropertyId;
		events.clear();
	});

	const baseRow = (
		overrides: Partial<{ observedDate: string; clicks: number; impressions: number }> = {},
	) => ({
		observedDate: overrides.observedDate ?? '2026-05-01',
		clicks: overrides.clicks ?? 100,
		impressions: overrides.impressions ?? 2000,
		avgClickPosition: 4.5,
		avgImpressionPosition: 12.3,
	});

	const buildUseCase = () =>
		new IngestBingTrafficUseCase(propRepo, obsRepo, events, new FakeClock('2026-05-04T11:00:00Z'));

	it('persists rows and publishes BingTrafficBatchIngested with totals on first ingest', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute({
			bingPropertyId: propertyId,
			rows: [baseRow(), baseRow({ observedDate: '2026-05-02', clicks: 50 })],
			rawPayloadId: null,
		});
		expect(result.ingested).toBe(2);
		expect(obsRepo.store.size).toBe(2);
		const [evt] = events.published();
		expect(evt?.type).toBe('BingTrafficBatchIngested');
		expect((evt as BingWebmasterInsights.BingTrafficBatchIngested).totalClicks).toBe(150);
	});

	it('reports zero ingested when re-running the same window', async () => {
		const useCase = buildUseCase();
		await useCase.execute({ bingPropertyId: propertyId, rows: [baseRow()], rawPayloadId: null });
		events.clear();
		const second = await useCase.execute({
			bingPropertyId: propertyId,
			rows: [baseRow()],
			rawPayloadId: null,
		});
		expect(second.ingested).toBe(0);
		expect((events.published()[0] as BingWebmasterInsights.BingTrafficBatchIngested).rowsCount).toBe(0);
	});

	it('throws NotFoundError when the property does not exist', async () => {
		const useCase = buildUseCase();
		await expect(
			useCase.execute({ bingPropertyId: 'missing', rows: [baseRow()], rawPayloadId: null }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('returns 0 and does not publish when called with an empty batch', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute({ bingPropertyId: propertyId, rows: [], rawPayloadId: null });
		expect(result.ingested).toBe(0);
		expect(events.published()).toEqual([]);
	});

	it('rejects rows where avg position is < 1 (Bing positions are 1-indexed)', async () => {
		const useCase = buildUseCase();
		await expect(
			useCase.execute({
				bingPropertyId: propertyId,
				rows: [{ ...baseRow(), avgClickPosition: 0.5, avgImpressionPosition: 0.7 }],
				rawPayloadId: null,
			}),
		).rejects.toThrow();
	});
});
