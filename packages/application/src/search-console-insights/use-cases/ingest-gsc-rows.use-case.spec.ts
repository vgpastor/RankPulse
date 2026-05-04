import {
	type IdentityAccess,
	type ProjectManagement,
	SearchConsoleInsights,
	type SharedKernel,
} from '@rankpulse/domain';
import { FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestGscRowsUseCase } from './ingest-gsc-rows.use-case.js';

const propertyId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as SearchConsoleInsights.GscPropertyId;
const projectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as ProjectManagement.ProjectId;
const orgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;

const buildProperty = (now: Date): SearchConsoleInsights.GscProperty =>
	SearchConsoleInsights.GscProperty.link({
		id: propertyId,
		organizationId: orgId,
		projectId,
		siteUrl: 'https://controlrondas.com/',
		propertyType: SearchConsoleInsights.GscPropertyTypes.URL_PREFIX,
		credentialId: null,
		now,
	});

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

class ObservationRepo implements SearchConsoleInsights.GscPerformanceObservationRepository {
	saved: SearchConsoleInsights.GscPerformanceObservation[] = [];
	async saveAll(observations: readonly SearchConsoleInsights.GscPerformanceObservation[]): Promise<void> {
		this.saved.push(...observations);
	}
	async listForProperty(): Promise<readonly SearchConsoleInsights.GscPerformanceObservation[]> {
		return this.saved;
	}
	async listLatestForProject(): Promise<readonly SearchConsoleInsights.GscPerformanceObservation[]> {
		return this.saved;
	}
}

class CapturingPublisher implements SharedKernel.EventPublisher {
	events: SharedKernel.DomainEvent[] = [];
	async publish(events: readonly SharedKernel.DomainEvent[]): Promise<void> {
		this.events.push(...events);
	}
}

describe('IngestGscRowsUseCase', () => {
	let propertyRepo: PropertyRepo;
	let obsRepo: ObservationRepo;
	let publisher: CapturingPublisher;
	let useCase: IngestGscRowsUseCase;

	const ids = (n: number): FixedIdGenerator =>
		new FixedIdGenerator(
			Array.from({ length: n }, (_, i) => `dddddddd-dddd-dddd-dddd-${String(i).padStart(12, '0')}` as Uuid),
		);

	beforeEach(async () => {
		propertyRepo = new PropertyRepo();
		obsRepo = new ObservationRepo();
		publisher = new CapturingPublisher();
		await propertyRepo.save(buildProperty(new Date('2026-04-01T00:00:00Z')));
		useCase = new IngestGscRowsUseCase(propertyRepo, obsRepo, ids(50), publisher);
	});

	it('persists each row as a typed observation and emits one event per row', async () => {
		const result = await useCase.execute({
			gscPropertyId: propertyId,
			rawPayloadId: null,
			rows: [
				{
					observedAt: new Date('2026-05-01T00:00:00Z'),
					query: 'control de rondas',
					page: 'https://controlrondas.com/',
					country: 'esp',
					device: 'desktop',
					clicks: 12,
					impressions: 340,
					ctr: 12 / 340,
					position: 7.4,
				},
				{
					observedAt: new Date('2026-05-02T00:00:00Z'),
					query: 'app control de rondas',
					page: 'https://controlrondas.com/app',
					country: 'mex',
					device: 'mobile',
					clicks: 5,
					impressions: 120,
					ctr: 5 / 120,
					position: 4.1,
				},
			],
		});
		expect(result.ingested).toBe(2);
		expect(obsRepo.saved).toHaveLength(2);
		expect(publisher.events.map((e) => e.type)).toEqual(['GscPerformanceIngested', 'GscPerformanceIngested']);
	});

	it('returns 0 and does not call repos when rows is empty', async () => {
		const result = await useCase.execute({ gscPropertyId: propertyId, rawPayloadId: null, rows: [] });
		expect(result.ingested).toBe(0);
		expect(obsRepo.saved).toHaveLength(0);
		expect(publisher.events).toHaveLength(0);
	});

	it('throws NotFoundError when the property does not exist', async () => {
		await expect(
			useCase.execute({
				gscPropertyId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
				rawPayloadId: null,
				rows: [
					{
						observedAt: new Date(),
						query: null,
						page: null,
						country: null,
						device: null,
						clicks: 0,
						impressions: 0,
						ctr: 0,
						position: 0,
					},
				],
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
