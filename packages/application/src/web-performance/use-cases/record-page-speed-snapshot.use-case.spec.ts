import type { IdentityAccess, ProjectManagement, WebPerformance } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RecordPageSpeedSnapshotUseCase } from './record-page-speed-snapshot.use-case.js';
import { TrackPageUseCase } from './track-page.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryTrackedPageRepo implements WebPerformance.TrackedPageRepository {
	readonly store = new Map<string, WebPerformance.TrackedPage>();
	async save(p: WebPerformance.TrackedPage): Promise<void> {
		this.store.set(p.id, p);
	}
	async findById(id: WebPerformance.TrackedPageId) {
		return this.store.get(id) ?? null;
	}
	async findByTuple() {
		return null;
	}
	async listForProject() {
		return [...this.store.values()];
	}
	async delete() {}
}

class InMemorySnapshotRepo implements WebPerformance.PageSpeedSnapshotRepository {
	readonly store = new Map<string, WebPerformance.PageSpeedSnapshot>();
	async save(snap: WebPerformance.PageSpeedSnapshot): Promise<{ inserted: boolean }> {
		const key = `${snap.trackedPageId}|${snap.observedAt.toISOString()}`;
		if (this.store.has(key)) return { inserted: false };
		this.store.set(key, snap);
		return { inserted: true };
	}
	async listForPage() {
		return [...this.store.values()];
	}
}

describe('RecordPageSpeedSnapshotUseCase', () => {
	let trackedPageRepo: InMemoryTrackedPageRepo;
	let snapshotRepo: InMemorySnapshotRepo;
	let events: RecordingEventPublisher;
	let pageId: string;

	beforeEach(async () => {
		trackedPageRepo = new InMemoryTrackedPageRepo();
		snapshotRepo = new InMemorySnapshotRepo();
		events = new RecordingEventPublisher();
		const tracker = new TrackPageUseCase(
			trackedPageRepo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['page-1' as Uuid]),
			events,
		);
		const result = await tracker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			url: 'https://example.com/',
			strategy: 'mobile',
		});
		pageId = result.trackedPageId;
		events.clear();
	});

	const baseSnapshot = (overrides: Partial<{ observedAt: Date; lcpMs: number | null }> = {}) => ({
		trackedPageId: pageId,
		observedAt: overrides.observedAt ?? new Date('2026-05-04T11:00:00Z'),
		lcpMs: overrides.lcpMs ?? 2400,
		inpMs: 180,
		cls: 0.05,
		fcpMs: 1500,
		ttfbMs: 400,
		performanceScore: 0.92,
		seoScore: 0.95,
		accessibilityScore: 0.88,
		bestPracticesScore: 0.91,
	});

	it('persists the snapshot and publishes PageSpeedSnapshotRecorded on first insert', async () => {
		const useCase = new RecordPageSpeedSnapshotUseCase(trackedPageRepo, snapshotRepo, events);
		const result = await useCase.execute(baseSnapshot());
		expect(result.inserted).toBe(true);
		expect(snapshotRepo.store.size).toBe(1);
		expect(events.publishedTypes()).toContain('PageSpeedSnapshotRecorded');
	});

	it('does NOT publish event on idempotent re-fetch (same observedAt)', async () => {
		const useCase = new RecordPageSpeedSnapshotUseCase(trackedPageRepo, snapshotRepo, events);
		await useCase.execute(baseSnapshot());
		events.clear();
		const second = await useCase.execute(baseSnapshot());
		expect(second.inserted).toBe(false);
		expect(events.publishedTypes()).toEqual([]);
	});

	it('throws NotFoundError when the tracked page does not exist', async () => {
		const useCase = new RecordPageSpeedSnapshotUseCase(trackedPageRepo, snapshotRepo, events);
		await expect(useCase.execute({ ...baseSnapshot(), trackedPageId: 'missing' })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it('persists null metrics when PSI returned no CrUX data for the URL', async () => {
		const useCase = new RecordPageSpeedSnapshotUseCase(trackedPageRepo, snapshotRepo, events);
		await useCase.execute({
			...baseSnapshot(),
			lcpMs: null,
			inpMs: null,
			cls: null,
			fcpMs: null,
			ttfbMs: null,
			performanceScore: null,
			seoScore: null,
			accessibilityScore: null,
			bestPracticesScore: null,
		});
		expect(snapshotRepo.store.size).toBe(1);
		const [stored] = snapshotRepo.store.values();
		expect(stored?.lcpMs).toBeNull();
		expect(stored?.performanceScore).toBeNull();
	});

	it('rejects scores outside [0,1] at the aggregate boundary', async () => {
		const useCase = new RecordPageSpeedSnapshotUseCase(trackedPageRepo, snapshotRepo, events);
		await expect(useCase.execute({ ...baseSnapshot(), performanceScore: 1.5 })).rejects.toThrow();
		expect(snapshotRepo.store.size).toBe(0);
	});

	it('rejects negative ms metrics at the aggregate boundary', async () => {
		const useCase = new RecordPageSpeedSnapshotUseCase(trackedPageRepo, snapshotRepo, events);
		await expect(useCase.execute({ ...baseSnapshot(), lcpMs: -100 })).rejects.toThrow();
		expect(snapshotRepo.store.size).toBe(0);
	});
});
