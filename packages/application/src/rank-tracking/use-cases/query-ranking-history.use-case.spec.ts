import { type IdentityAccess, ProjectManagement, RankTracking } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryRankingHistoryUseCase } from './query-ranking-history.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const TRACKED_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as RankTracking.TrackedKeywordId;
const OTHER_TRACKED_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab' as Uuid as RankTracking.TrackedKeywordId;

class InMemoryTrackedRepo implements RankTracking.TrackedKeywordRepository {
	readonly store = new Map<string, RankTracking.TrackedKeyword>();
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
	async listByProjectQuery(): Promise<readonly RankTracking.TrackedKeyword[]> {
		return [];
	}
	async countForProject(): Promise<number> {
		return 0;
	}
}

class InMemoryObsRepo implements RankTracking.RankingObservationRepository {
	readonly rows: RankTracking.RankingObservation[] = [];
	async save(o: RankTracking.RankingObservation): Promise<void> {
		this.rows.push(o);
	}
	async findLatestFor(): Promise<RankTracking.RankingObservation | null> {
		return null;
	}
	async listForKeyword(
		trackedKeywordId: RankTracking.TrackedKeywordId,
		from: Date,
		to: Date,
	): Promise<readonly RankTracking.RankingObservation[]> {
		return this.rows
			.filter((r) => r.trackedKeywordId === trackedKeywordId)
			.filter((r) => r.observedAt >= from && r.observedAt <= to)
			.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
	}
	async listLatestForProject(): Promise<readonly RankTracking.RankingObservation[]> {
		return [];
	}
}

const buildTracked = (id: RankTracking.TrackedKeywordId = TRACKED_ID): RankTracking.TrackedKeyword =>
	RankTracking.TrackedKeyword.start({
		id,
		organizationId: ORG_ID,
		projectId: PROJECT_ID,
		domain: ProjectManagement.DomainName.create('controlrondas.com'),
		phrase: ProjectManagement.KeywordPhrase.create('control de rondas'),
		location: ProjectManagement.LocationLanguage.create({ country: 'ES', language: 'es' }),
		device: RankTracking.Devices.DESKTOP,
		now: new Date('2026-05-04T10:00:00Z'),
	});

const buildObservation = (overrides: {
	id: string;
	observedAt: Date;
	position: number | null;
	trackedKeywordId?: RankTracking.TrackedKeywordId;
}): RankTracking.RankingObservation =>
	RankTracking.RankingObservation.record({
		id: overrides.id as Uuid as RankTracking.RankingObservationId,
		trackedKeywordId: overrides.trackedKeywordId ?? TRACKED_ID,
		projectId: PROJECT_ID,
		domain: 'controlrondas.com',
		phrase: 'control de rondas',
		country: 'ES',
		language: 'es',
		device: RankTracking.Devices.DESKTOP,
		position: RankTracking.Position.fromNullable(overrides.position),
		url: 'https://controlrondas.com/',
		serpFeatures: [],
		sourceProvider: 'dataforseo',
		rawPayloadId: null,
		now: overrides.observedAt,
	});

describe('QueryRankingHistoryUseCase', () => {
	let trackedRepo: InMemoryTrackedRepo;
	let obsRepo: InMemoryObsRepo;
	let useCase: QueryRankingHistoryUseCase;

	beforeEach(async () => {
		trackedRepo = new InMemoryTrackedRepo();
		obsRepo = new InMemoryObsRepo();
		useCase = new QueryRankingHistoryUseCase(trackedRepo, obsRepo);
		await trackedRepo.save(buildTracked());
	});

	it('returns observations ordered by date for the keyword', async () => {
		await obsRepo.save(
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				observedAt: new Date('2026-05-01T00:00:00Z'),
				position: 5,
			}),
		);
		await obsRepo.save(
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				observedAt: new Date('2026-05-02T00:00:00Z'),
				position: 3,
			}),
		);

		const result = await useCase.execute({
			trackedKeywordId: TRACKED_ID,
			from: new Date('2026-05-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.position)).toEqual([5, 3]);
	});

	it('throws NotFoundError when the tracked keyword does not exist', async () => {
		await expect(
			useCase.execute({
				trackedKeywordId: 'missing',
				from: new Date('2026-05-01T00:00:00Z'),
				to: new Date('2026-05-31T00:00:00Z'),
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('serialises position=null when out of tracked window', async () => {
		await obsRepo.save(
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				observedAt: new Date('2026-05-01T00:00:00Z'),
				position: null,
			}),
		);

		const result = await useCase.execute({
			trackedKeywordId: TRACKED_ID,
			from: new Date('2026-05-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result[0]?.position).toBeNull();
	});

	it('scopes results to the requested keyword', async () => {
		await trackedRepo.save(buildTracked(OTHER_TRACKED_ID));
		await obsRepo.save(
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000001',
				observedAt: new Date('2026-05-01T00:00:00Z'),
				position: 5,
			}),
		);
		await obsRepo.save(
			buildObservation({
				id: 'dddddddd-dddd-dddd-dddd-000000000002',
				observedAt: new Date('2026-05-01T00:00:00Z'),
				position: 99,
				trackedKeywordId: OTHER_TRACKED_ID,
			}),
		);

		const result = await useCase.execute({
			trackedKeywordId: TRACKED_ID,
			from: new Date('2026-05-01T00:00:00Z'),
			to: new Date('2026-05-01T00:00:00Z'),
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.position).toBe(5);
	});
});
