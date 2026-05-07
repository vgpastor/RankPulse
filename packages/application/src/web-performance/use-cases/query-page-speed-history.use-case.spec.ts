import { type IdentityAccess, type ProjectManagement, WebPerformance } from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryPageSpeedHistoryUseCase } from './query-page-speed-history.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const PAGE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as WebPerformance.TrackedPageId;
const OTHER_PAGE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab' as Uuid as WebPerformance.TrackedPageId;

class InMemoryPageRepo implements WebPerformance.TrackedPageRepository {
	readonly store = new Map<string, WebPerformance.TrackedPage>();
	async save(p: WebPerformance.TrackedPage): Promise<void> {
		this.store.set(p.id, p);
	}
	async findById(id: WebPerformance.TrackedPageId): Promise<WebPerformance.TrackedPage | null> {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndUrl(): Promise<WebPerformance.TrackedPage | null> {
		return null;
	}
	async findByTuple(): Promise<WebPerformance.TrackedPage | null> {
		return null;
	}
	async delete(id: WebPerformance.TrackedPageId): Promise<void> {
		this.store.delete(id);
	}
	async listForProject(): Promise<readonly WebPerformance.TrackedPage[]> {
		return [];
	}
	async listForOrganization(): Promise<readonly WebPerformance.TrackedPage[]> {
		return [];
	}
}

class InMemorySnapshotRepo implements WebPerformance.PageSpeedSnapshotRepository {
	readonly rows: WebPerformance.PageSpeedSnapshot[] = [];
	async save(s: WebPerformance.PageSpeedSnapshot): Promise<{ inserted: boolean }> {
		this.rows.push(s);
		return { inserted: true };
	}
	async listForPage(
		trackedPageId: WebPerformance.TrackedPageId,
		query: { from: Date; to: Date },
	): Promise<readonly WebPerformance.PageSpeedSnapshot[]> {
		return this.rows
			.filter((r) => r.trackedPageId === trackedPageId)
			.filter((r) => r.observedAt >= query.from && r.observedAt <= query.to)
			.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
	}
}

const buildSnapshot = (overrides: {
	observedAt: Date;
	lcpMs?: number | null;
	trackedPageId?: WebPerformance.TrackedPageId;
}): WebPerformance.PageSpeedSnapshot =>
	WebPerformance.PageSpeedSnapshot.record({
		trackedPageId: overrides.trackedPageId ?? PAGE_ID,
		projectId: PROJECT_ID,
		observedAt: overrides.observedAt,
		lcpMs: overrides.lcpMs === undefined ? 2400 : overrides.lcpMs,
		inpMs: 200,
		cls: 0.05,
		fcpMs: 1100,
		ttfbMs: 250,
		performanceScore: 0.92,
		seoScore: 0.95,
		accessibilityScore: 0.88,
		bestPracticesScore: 0.91,
	});

describe('QueryPageSpeedHistoryUseCase', () => {
	let pageRepo: InMemoryPageRepo;
	let snapshotsRepo: InMemorySnapshotRepo;
	let useCase: QueryPageSpeedHistoryUseCase;

	beforeEach(async () => {
		pageRepo = new InMemoryPageRepo();
		snapshotsRepo = new InMemorySnapshotRepo();
		useCase = new QueryPageSpeedHistoryUseCase(pageRepo, snapshotsRepo);
		await pageRepo.save(
			WebPerformance.TrackedPage.add({
				id: PAGE_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				url: WebPerformance.PageUrl.create('https://example.com/'),
				strategy: WebPerformance.PageSpeedStrategies.MOBILE,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
	});

	it('returns snapshots in window for the page', async () => {
		await snapshotsRepo.save(buildSnapshot({ observedAt: new Date('2026-05-01T00:00:00Z'), lcpMs: 2400 }));
		await snapshotsRepo.save(buildSnapshot({ observedAt: new Date('2026-05-02T00:00:00Z'), lcpMs: 1900 }));

		const result = await useCase.execute({
			trackedPageId: PAGE_ID,
			from: new Date('2026-05-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.lcpMs)).toEqual([2400, 1900]);
		expect(result[0]?.performanceScore).toBe(0.92);
	});

	it('throws NotFoundError when the tracked page does not exist', async () => {
		await expect(
			useCase.execute({
				trackedPageId: 'missing',
				from: new Date('2026-05-01T00:00:00Z'),
				to: new Date('2026-05-31T00:00:00Z'),
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('serialises null core-web-vitals when PSI returned no value', async () => {
		await snapshotsRepo.save(buildSnapshot({ observedAt: new Date('2026-05-01T00:00:00Z'), lcpMs: null }));

		const result = await useCase.execute({
			trackedPageId: PAGE_ID,
			from: new Date('2026-05-01T00:00:00Z'),
			to: new Date('2026-05-31T00:00:00Z'),
		});

		expect(result[0]?.lcpMs).toBeNull();
	});

	it('scopes results to the requested page', async () => {
		await pageRepo.save(
			WebPerformance.TrackedPage.add({
				id: OTHER_PAGE_ID,
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				url: WebPerformance.PageUrl.create('https://example.com/other'),
				strategy: WebPerformance.PageSpeedStrategies.DESKTOP,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
		await snapshotsRepo.save(buildSnapshot({ observedAt: new Date('2026-05-01T00:00:00Z'), lcpMs: 2400 }));
		await snapshotsRepo.save(
			buildSnapshot({
				observedAt: new Date('2026-05-01T00:00:00Z'),
				lcpMs: 9999,
				trackedPageId: OTHER_PAGE_ID,
			}),
		);

		const result = await useCase.execute({
			trackedPageId: PAGE_ID,
			from: new Date('2026-05-01T00:00:00Z'),
			to: new Date('2026-05-01T00:00:00Z'),
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.lcpMs).toBe(2400);
	});
});
