import type { IdentityAccess, ProjectManagement, WebPerformance } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
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
	async findByTuple(
		projectId: ProjectManagement.ProjectId,
		url: WebPerformance.PageUrl,
		strategy: WebPerformance.PageSpeedStrategy,
	) {
		for (const p of this.store.values()) {
			if (p.projectId === projectId && p.url.value === url.value && p.strategy === strategy) return p;
		}
		return null;
	}
	async listForProject(projectId: ProjectManagement.ProjectId) {
		return [...this.store.values()].filter((p) => p.projectId === projectId);
	}
	async delete(id: WebPerformance.TrackedPageId) {
		this.store.delete(id);
	}
}

const buildClock = () => new FakeClock('2026-05-04T10:00:00Z');
const buildIds = (...uuids: string[]) => new FixedIdGenerator(uuids as Uuid[]);

describe('TrackPageUseCase', () => {
	it('persists a fresh tracked page and emits TrackedPageAdded', async () => {
		const repo = new InMemoryTrackedPageRepo();
		const events = new RecordingEventPublisher();
		const useCase = new TrackPageUseCase(repo, buildClock(), buildIds('page-1' as never), events);

		const result = await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			url: 'https://example.com/landing',
			strategy: 'mobile',
		});

		expect(result.trackedPageId).toBe('page-1');
		expect(repo.store.size).toBe(1);
		const stored = [...repo.store.values()][0];
		expect(stored?.url.value).toBe('https://example.com/landing');
		expect(stored?.strategy).toBe('mobile');
		expect(events.publishedTypes()).toContain('TrackedPageAdded');
	});

	it('throws ConflictError when (project, url, strategy) is already tracked', async () => {
		const repo = new InMemoryTrackedPageRepo();
		const events = new RecordingEventPublisher();
		const useCase = new TrackPageUseCase(
			repo,
			buildClock(),
			buildIds('page-1' as never, 'page-2' as never),
			events,
		);
		await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			url: 'https://example.com/',
			strategy: 'mobile',
		});
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				url: 'https://example.com/',
				strategy: 'mobile',
			}),
		).rejects.toBeInstanceOf(ConflictError);
	});

	it('allows the same URL with different strategies (mobile + desktop = 2 tracked pages)', async () => {
		const repo = new InMemoryTrackedPageRepo();
		const events = new RecordingEventPublisher();
		const useCase = new TrackPageUseCase(
			repo,
			buildClock(),
			buildIds('page-1' as never, 'page-2' as never),
			events,
		);
		await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			url: 'https://example.com/',
			strategy: 'mobile',
		});
		await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			url: 'https://example.com/',
			strategy: 'desktop',
		});
		expect(repo.store.size).toBe(2);
	});

	it('strips URL fragments before persisting (canonicalisation)', async () => {
		const repo = new InMemoryTrackedPageRepo();
		const events = new RecordingEventPublisher();
		const useCase = new TrackPageUseCase(repo, buildClock(), buildIds('page-1' as never), events);
		await useCase.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			url: 'https://example.com/page#section',
			strategy: 'mobile',
		});
		const stored = [...repo.store.values()][0];
		expect(stored?.url.value).toBe('https://example.com/page');
	});

	it('rejects non-http(s) URLs before touching the repo', async () => {
		const repo = new InMemoryTrackedPageRepo();
		const events = new RecordingEventPublisher();
		const useCase = new TrackPageUseCase(repo, buildClock(), buildIds('page-1' as never), events);
		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				projectId: PROJECT_ID,
				url: 'ftp://example.com/',
				strategy: 'mobile',
			}),
		).rejects.toThrow();
		expect(repo.store.size).toBe(0);
	});
});
