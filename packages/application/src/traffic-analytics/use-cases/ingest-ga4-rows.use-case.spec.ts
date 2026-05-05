import type { IdentityAccess, ProjectManagement, TrafficAnalytics } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestGa4RowsUseCase } from './ingest-ga4-rows.use-case.js';
import { LinkGa4PropertyUseCase } from './link-ga4-property.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryPropertyRepo implements TrafficAnalytics.Ga4PropertyRepository {
	readonly store = new Map<string, TrafficAnalytics.Ga4Property>();
	async save(p: TrafficAnalytics.Ga4Property): Promise<void> {
		this.store.set(p.id, p);
	}
	async findById(id: TrafficAnalytics.Ga4PropertyId): Promise<TrafficAnalytics.Ga4Property | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndHandle(): Promise<TrafficAnalytics.Ga4Property | null> {
		return null;
	}
	async listForProject(): Promise<readonly TrafficAnalytics.Ga4Property[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly TrafficAnalytics.Ga4Property[]> {
		return [];
	}
}

class InMemoryMetricRepo implements TrafficAnalytics.Ga4DailyMetricRepository {
	readonly store = new Map<string, TrafficAnalytics.Ga4DailyMetric>();
	async saveAll(metrics: readonly TrafficAnalytics.Ga4DailyMetric[]): Promise<{ inserted: number }> {
		let inserted = 0;
		for (const m of metrics) {
			const k = `${m.ga4PropertyId}|${m.observedDate}|${m.dimensionsHash}`;
			if (this.store.has(k)) continue;
			this.store.set(k, m);
			inserted += 1;
		}
		return { inserted };
	}
	async listForProperty(): Promise<readonly TrafficAnalytics.Ga4DailyMetric[]> {
		return [...this.store.values()];
	}
	async listLatestForProject(): Promise<readonly TrafficAnalytics.Ga4DailyMetric[]> {
		return [...this.store.values()];
	}
}

describe('IngestGa4RowsUseCase', () => {
	let propRepo: InMemoryPropertyRepo;
	let metricRepo: InMemoryMetricRepo;
	let events: RecordingEventPublisher;
	let propertyId: string;

	beforeEach(async () => {
		propRepo = new InMemoryPropertyRepo();
		metricRepo = new InMemoryMetricRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkGa4PropertyUseCase(
			propRepo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['ga4-prop-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			propertyHandle: 'properties/123456789',
		});
		propertyId = result.ga4PropertyId;
		events.clear();
	});

	const baseRow = (
		overrides: Partial<{
			observedDate: string;
			dimensions: Record<string, string>;
			metrics: Record<string, number>;
		}> = {},
	) => ({
		observedDate: overrides.observedDate ?? '2026-05-01',
		dimensions: overrides.dimensions ?? { date: '2026-05-01', sessionDefaultChannelGroup: 'Organic Search' },
		metrics: overrides.metrics ?? { sessions: 100, totalUsers: 80, screenPageViews: 240 },
	});

	const buildUseCase = () =>
		new IngestGa4RowsUseCase(
			propRepo,
			metricRepo,
			new FixedIdGenerator(['m-1' as Uuid, 'm-2' as Uuid, 'm-3' as Uuid]),
			events,
			new FakeClock('2026-05-04T11:00:00Z'),
		);

	it('persists rows and publishes Ga4BatchIngested with totals on first ingest', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute({
			ga4PropertyId: propertyId,
			rows: [
				baseRow({ metrics: { sessions: 100, totalUsers: 80 } }),
				baseRow({
					observedDate: '2026-05-02',
					dimensions: { date: '2026-05-02', sessionDefaultChannelGroup: 'Direct' },
					metrics: { sessions: 50, totalUsers: 40 },
				}),
			],
			rawPayloadId: null,
		});
		expect(result.ingested).toBe(2);
		expect(metricRepo.store.size).toBe(2);
		const [evt] = events.published();
		expect(evt?.type).toBe('Ga4BatchIngested');
		expect((evt as TrafficAnalytics.Ga4BatchIngested).totalSessions).toBe(150);
		expect((evt as TrafficAnalytics.Ga4BatchIngested).totalUsers).toBe(120);
	});

	it('reports zero ingested when re-running the same window with the same dimensions', async () => {
		const useCase = buildUseCase();
		await useCase.execute({ ga4PropertyId: propertyId, rows: [baseRow()], rawPayloadId: null });
		events.clear();
		const second = await useCase.execute({
			ga4PropertyId: propertyId,
			rows: [baseRow()],
			rawPayloadId: null,
		});
		expect(second.ingested).toBe(0);
		expect(metricRepo.store.size).toBe(1);
		expect((events.published()[0] as TrafficAnalytics.Ga4BatchIngested).rowsCount).toBe(0);
	});

	it('writes a new row when the dimension breakdown changes for the same date', async () => {
		const useCase = buildUseCase();
		await useCase.execute({
			ga4PropertyId: propertyId,
			rows: [baseRow({ dimensions: { date: '2026-05-01', country: 'Spain' } })],
			rawPayloadId: null,
		});
		await useCase.execute({
			ga4PropertyId: propertyId,
			rows: [baseRow({ dimensions: { date: '2026-05-01', country: 'Mexico' } })],
			rawPayloadId: null,
		});
		expect(metricRepo.store.size).toBe(2);
	});

	it('throws NotFoundError when the property does not exist', async () => {
		const useCase = buildUseCase();
		await expect(
			useCase.execute({ ga4PropertyId: 'missing', rows: [baseRow()], rawPayloadId: null }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('returns 0 and does not publish when called with an empty batch', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute({ ga4PropertyId: propertyId, rows: [], rawPayloadId: null });
		expect(result.ingested).toBe(0);
		expect(events.published()).toEqual([]);
	});

	it('rejects rows with non-finite metric values at the aggregate boundary', async () => {
		const useCase = buildUseCase();
		await expect(
			useCase.execute({
				ga4PropertyId: propertyId,
				rows: [baseRow({ metrics: { sessions: Number.NaN } })],
				rawPayloadId: null,
			}),
		).rejects.toThrow();
	});

	it('preserves dimension hash stability under key reordering', async () => {
		const useCase = buildUseCase();
		await useCase.execute({
			ga4PropertyId: propertyId,
			rows: [baseRow({ dimensions: { country: 'Spain', date: '2026-05-01' } })],
			rawPayloadId: null,
		});
		await useCase.execute({
			ga4PropertyId: propertyId,
			rows: [baseRow({ dimensions: { date: '2026-05-01', country: 'Spain' } })],
			rawPayloadId: null,
		});
		// Same logical dimensions in different key order -> same hash -> idempotent.
		expect(metricRepo.store.size).toBe(1);
	});
});
