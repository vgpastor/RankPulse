import { type IdentityAccess, type ProjectManagement, TrafficAnalytics } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryGa4MetricsUseCase } from './query-ga4-metrics.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const GA4_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as TrafficAnalytics.Ga4PropertyId;
const OTHER_GA4_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab' as Uuid as TrafficAnalytics.Ga4PropertyId;

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
	readonly rows: TrafficAnalytics.Ga4DailyMetric[] = [];
	async saveAll(metrics: readonly TrafficAnalytics.Ga4DailyMetric[]): Promise<{ inserted: number }> {
		this.rows.push(...metrics);
		return { inserted: metrics.length };
	}
	async listForProperty(
		propertyId: TrafficAnalytics.Ga4PropertyId,
		query: { from: string; to: string },
	): Promise<readonly TrafficAnalytics.Ga4DailyMetric[]> {
		return this.rows
			.filter((r) => r.ga4PropertyId === propertyId)
			.filter((r) => r.observedDate >= query.from && r.observedDate <= query.to)
			.sort((a, b) => a.observedDate.localeCompare(b.observedDate));
	}
	async listLatestForProject(): Promise<readonly TrafficAnalytics.Ga4DailyMetric[]> {
		return [];
	}
}

const buildMetric = (overrides: {
	id: string;
	observedDate: string;
	sessions?: number;
	ga4PropertyId?: TrafficAnalytics.Ga4PropertyId;
}): TrafficAnalytics.Ga4DailyMetric =>
	TrafficAnalytics.Ga4DailyMetric.record({
		id: overrides.id as Uuid as TrafficAnalytics.Ga4DailyMetricId,
		ga4PropertyId: overrides.ga4PropertyId ?? GA4_ID,
		projectId: PROJECT_ID,
		observedDate: overrides.observedDate,
		dimensionsHash: `hash-${overrides.observedDate}`,
		body: TrafficAnalytics.Ga4DailyDimensionsMetrics.create({
			dimensions: { country: 'US' },
			metrics: { sessions: overrides.sessions ?? 100, conversions: 5 },
		}),
		rawPayloadId: null,
	});

describe('QueryGa4MetricsUseCase', () => {
	let propRepo: InMemoryPropertyRepo;
	let metricRepo: InMemoryMetricRepo;
	let useCase: QueryGa4MetricsUseCase;

	beforeEach(async () => {
		propRepo = new InMemoryPropertyRepo();
		metricRepo = new InMemoryMetricRepo();
		useCase = new QueryGa4MetricsUseCase(propRepo, metricRepo);
		await propRepo.save(
			TrafficAnalytics.Ga4Property.link({
				id: GA4_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				propertyHandle: 'properties/123456789',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
	});

	it('returns metrics in window for the property', async () => {
		await metricRepo.saveAll([
			buildMetric({ id: 'dddddddd-dddd-dddd-dddd-000000000001', observedDate: '2026-05-01', sessions: 100 }),
			buildMetric({ id: 'dddddddd-dddd-dddd-dddd-000000000002', observedDate: '2026-05-02', sessions: 200 }),
		]);

		const result = await useCase.execute({
			ga4PropertyId: GA4_ID,
			from: '2026-05-01',
			to: '2026-05-02',
		});

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.metrics.sessions)).toEqual([100, 200]);
		expect(result[0]?.dimensions).toEqual({ country: 'US' });
	});

	it('throws NotFoundError when the property does not exist', async () => {
		await expect(
			useCase.execute({ ga4PropertyId: 'missing', from: '2026-05-01', to: '2026-05-02' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('honours the date window', async () => {
		await metricRepo.saveAll([
			buildMetric({ id: 'dddddddd-dddd-dddd-dddd-000000000001', observedDate: '2026-04-30' }),
			buildMetric({ id: 'dddddddd-dddd-dddd-dddd-000000000002', observedDate: '2026-05-15' }),
		]);

		const result = await useCase.execute({
			ga4PropertyId: GA4_ID,
			from: '2026-05-01',
			to: '2026-05-31',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.observedDate).toBe('2026-05-15');
	});

	it('scopes results to the requested property', async () => {
		await propRepo.save(
			TrafficAnalytics.Ga4Property.link({
				id: OTHER_GA4_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				propertyHandle: 'properties/987654321',
				credentialId: null,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
		await metricRepo.saveAll([
			buildMetric({ id: 'dddddddd-dddd-dddd-dddd-000000000001', observedDate: '2026-05-01', sessions: 100 }),
			buildMetric({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				observedDate: '2026-05-01',
				sessions: 999,
				ga4PropertyId: OTHER_GA4_ID,
			}),
		]);

		const result = await useCase.execute({
			ga4PropertyId: GA4_ID,
			from: '2026-05-01',
			to: '2026-05-01',
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.metrics.sessions).toBe(100);
	});
});
