import { ProjectManagement, RankTracking, type SharedKernel } from '@rankpulse/domain';
import { type Clock, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { RecordRankingObservationUseCase } from './record-ranking-observation.use-case.js';

const trackedKeywordId = '11111111-1111-1111-1111-111111111111' as Uuid as RankTracking.TrackedKeywordId;
const projectId = '22222222-2222-2222-2222-222222222222' as Uuid as ProjectManagement.ProjectId;
const orgId = '33333333-3333-3333-3333-333333333333' as Uuid as Parameters<
	typeof RankTracking.TrackedKeyword.start
>[0]['organizationId'];

const buildTracked = (now: Date): RankTracking.TrackedKeyword =>
	RankTracking.TrackedKeyword.start({
		id: trackedKeywordId,
		organizationId: orgId,
		projectId,
		domain: ProjectManagement.DomainName.create('controlrondas.com'),
		phrase: ProjectManagement.KeywordPhrase.create('control de rondas'),
		location: ProjectManagement.LocationLanguage.create({ country: 'ES', language: 'es' }),
		device: RankTracking.Devices.DESKTOP,
		now,
	});

class TrackedRepo implements RankTracking.TrackedKeywordRepository {
	store = new Map<string, RankTracking.TrackedKeyword>();
	async save(t: RankTracking.TrackedKeyword): Promise<void> {
		this.store.set(t.id, t);
	}
	async findById(id: RankTracking.TrackedKeywordId): Promise<RankTracking.TrackedKeyword | null> {
		return this.store.get(id) ?? null;
	}
	async findExisting(): Promise<RankTracking.TrackedKeyword | null> {
		return null;
	}
	async listForProject(): Promise<readonly RankTracking.TrackedKeyword[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly RankTracking.TrackedKeyword[]> {
		return [];
	}
}

class ObservationRepo implements RankTracking.RankingObservationRepository {
	store = new Map<string, RankTracking.RankingObservation>();
	latestByKeyword = new Map<string, RankTracking.RankingObservation>();
	async save(o: RankTracking.RankingObservation): Promise<void> {
		this.store.set(o.id, o);
		this.latestByKeyword.set(o.trackedKeywordId, o);
	}
	async findLatestFor(id: RankTracking.TrackedKeywordId): Promise<RankTracking.RankingObservation | null> {
		return this.latestByKeyword.get(id) ?? null;
	}
	async listForKeyword(): Promise<readonly RankTracking.RankingObservation[]> {
		return [];
	}
	async listLatestForProject(): Promise<readonly RankTracking.RankingObservation[]> {
		return [];
	}
}

class CapturingPublisher implements SharedKernel.EventPublisher {
	events: SharedKernel.DomainEvent[] = [];
	async publish(events: readonly SharedKernel.DomainEvent[]): Promise<void> {
		this.events.push(...events);
	}
}

describe('RecordRankingObservationUseCase', () => {
	let trackedRepo: TrackedRepo;
	let obsRepo: ObservationRepo;
	let publisher: CapturingPublisher;
	let clock: Clock;
	let useCase: RecordRankingObservationUseCase;
	const ids = (count: number): FixedIdGenerator =>
		new FixedIdGenerator(
			Array.from(
				{ length: count },
				(_, i) => `aaaaaaaa-aaaa-aaaa-aaaa-${String(i).padStart(12, '0')}` as Uuid,
			),
		);

	beforeEach(async () => {
		trackedRepo = new TrackedRepo();
		obsRepo = new ObservationRepo();
		publisher = new CapturingPublisher();
		clock = new FakeClock(new Date('2026-05-04T10:00:00Z'));
		await trackedRepo.save(buildTracked(new Date('2026-04-01T10:00:00Z')));
		useCase = new RecordRankingObservationUseCase(trackedRepo, obsRepo, clock, ids(10), publisher);
	});

	it('records the first observation without emitting comparison events', async () => {
		const result = await useCase.execute({
			trackedKeywordId,
			position: 7,
			url: 'https://controlrondas.com/',
			sourceProvider: 'dataforseo',
			rawPayloadId: null,
		});
		expect(result.emittedEvents).toEqual([]);
		expect(obsRepo.store.size).toBe(1);
	});

	it('emits KeywordPositionChanged when the position differs', async () => {
		await useCase.execute({
			trackedKeywordId,
			position: 7,
			url: null,
			sourceProvider: 'dataforseo',
			rawPayloadId: null,
		});
		const result = await useCase.execute({
			trackedKeywordId,
			position: 4,
			url: null,
			sourceProvider: 'dataforseo',
			rawPayloadId: null,
		});
		expect(result.emittedEvents).toContain('KeywordPositionChanged');
		// 7 → 4 is fully inside the top-10 so no transition events fire.
		expect(result.emittedEvents).not.toContain('KeywordEnteredTopTen');
		expect(result.emittedEvents).not.toContain('KeywordDroppedFromFirstPage');
	});

	it('emits KeywordEnteredTopTen when transitioning into the top 10', async () => {
		await useCase.execute({
			trackedKeywordId,
			position: 15,
			url: null,
			sourceProvider: 'dataforseo',
			rawPayloadId: null,
		});
		const result = await useCase.execute({
			trackedKeywordId,
			position: 8,
			url: null,
			sourceProvider: 'dataforseo',
			rawPayloadId: null,
		});
		expect(result.emittedEvents).toContain('KeywordEnteredTopTen');
	});

	it('emits KeywordDroppedFromFirstPage when leaving the top 10', async () => {
		await useCase.execute({
			trackedKeywordId,
			position: 5,
			url: null,
			sourceProvider: 'dataforseo',
			rawPayloadId: null,
		});
		const result = await useCase.execute({
			trackedKeywordId,
			position: 14,
			url: null,
			sourceProvider: 'dataforseo',
			rawPayloadId: null,
		});
		expect(result.emittedEvents).toContain('KeywordDroppedFromFirstPage');
	});
});
