import { type IdentityAccess, type ProjectManagement, RankTracking } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { StartTrackingKeywordUseCase } from './start-tracking-keyword.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const TRACKED_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as RankTracking.TrackedKeywordId;

class InMemoryTrackedRepo implements RankTracking.TrackedKeywordRepository {
	readonly store = new Map<string, RankTracking.TrackedKeyword>();
	readonly byNaturalKey = new Map<string, RankTracking.TrackedKeyword>();

	private key(input: {
		projectId: ProjectManagement.ProjectId;
		domain: string;
		phrase: string;
		country: string;
		language: string;
		device: string;
		searchEngine: string;
	}): string {
		return [
			input.projectId,
			input.domain,
			input.phrase,
			input.country,
			input.language,
			input.device,
			input.searchEngine,
		].join('|');
	}

	async save(t: RankTracking.TrackedKeyword): Promise<void> {
		this.store.set(t.id, t);
		this.byNaturalKey.set(
			this.key({
				projectId: t.projectId,
				domain: t.domain.value,
				phrase: t.phrase.value,
				country: t.location.country,
				language: t.location.language,
				device: t.device,
				searchEngine: t.searchEngine,
			}),
			t,
		);
	}
	async findById(id: RankTracking.TrackedKeywordId): Promise<RankTracking.TrackedKeyword | null> {
		return this.store.get(id) ?? null;
	}
	async findExisting(input: {
		projectId: ProjectManagement.ProjectId;
		domain: string;
		phrase: string;
		country: string;
		language: string;
		device: string;
		searchEngine: string;
	}): Promise<RankTracking.TrackedKeyword | null> {
		return this.byNaturalKey.get(this.key(input)) ?? null;
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
		return this.store.size;
	}
}

describe('StartTrackingKeywordUseCase', () => {
	let repo: InMemoryTrackedRepo;
	let clock: FakeClock;
	let publisher: RecordingEventPublisher;
	let useCase: StartTrackingKeywordUseCase;

	beforeEach(() => {
		repo = new InMemoryTrackedRepo();
		clock = new FakeClock('2026-05-05T12:00:00Z');
		publisher = new RecordingEventPublisher();
		useCase = new StartTrackingKeywordUseCase(repo, clock, new FixedIdGenerator([TRACKED_ID]), publisher);
	});

	const baseCmd = {
		organizationId: ORG_ID,
		projectId: PROJECT_ID,
		domain: 'controlrondas.com',
		phrase: 'control de rondas',
		country: 'ES',
		language: 'es',
	};

	it('creates a TrackedKeyword and emits KeywordTrackingStarted', async () => {
		const result = await useCase.execute(baseCmd);

		expect(result.trackedKeywordId).toBe(TRACKED_ID);
		const persisted = await repo.findById(TRACKED_ID);
		expect(persisted?.phrase.value).toBe('control de rondas');
		expect(persisted?.device).toBe(RankTracking.Devices.DESKTOP);
		expect(publisher.publishedTypes()).toContain('TrackedKeywordStarted');
	});

	it('defaults to desktop when device is omitted', async () => {
		await useCase.execute(baseCmd);
		const persisted = await repo.findById(TRACKED_ID);
		expect(persisted?.device).toBe(RankTracking.Devices.DESKTOP);
	});

	it('honours the device override', async () => {
		await useCase.execute({ ...baseCmd, device: RankTracking.Devices.MOBILE });
		const persisted = await repo.findById(TRACKED_ID);
		expect(persisted?.device).toBe(RankTracking.Devices.MOBILE);
	});

	it('throws ConflictError when the same (project, domain, phrase, locale, device) already exists', async () => {
		await useCase.execute(baseCmd);
		// New use case instance because FixedIdGenerator is single-shot.
		const second = new StartTrackingKeywordUseCase(
			repo,
			clock,
			new FixedIdGenerator(['ffffffff-ffff-ffff-ffff-ffffffffffff' as Uuid]),
			publisher,
		);
		await expect(second.execute(baseCmd)).rejects.toBeInstanceOf(ConflictError);
	});

	it('treats different devices for the same query as distinct (no conflict)', async () => {
		await useCase.execute(baseCmd);
		const second = new StartTrackingKeywordUseCase(
			repo,
			clock,
			new FixedIdGenerator(['ffffffff-ffff-ffff-ffff-ffffffffffff' as Uuid]),
			publisher,
		);
		const result = await second.execute({ ...baseCmd, device: RankTracking.Devices.MOBILE });
		expect(result.trackedKeywordId).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
	});
});
