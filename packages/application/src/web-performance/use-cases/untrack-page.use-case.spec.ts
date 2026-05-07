import type { IdentityAccess, ProjectManagement, WebPerformance } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TrackPageUseCase } from './track-page.use-case.js';
import { UntrackPageUseCase } from './untrack-page.use-case.js';

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

describe('UntrackPageUseCase', () => {
	let repo: InMemoryTrackedPageRepo;
	let events: RecordingEventPublisher;
	let trackedPageId: string;

	beforeEach(async () => {
		repo = new InMemoryTrackedPageRepo();
		events = new RecordingEventPublisher();
		const tracker = new TrackPageUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['page-1' as Uuid]),
			events,
		);
		const result = await tracker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			url: 'https://example.com/landing',
			strategy: 'mobile',
		});
		trackedPageId = result.trackedPageId;
		events.clear();
	});

	it('hard-deletes the tracked page from the repository', async () => {
		const useCase = new UntrackPageUseCase(repo);

		await useCase.execute(trackedPageId);

		expect(repo.store.size).toBe(0);
		expect(await repo.findById(trackedPageId as WebPerformance.TrackedPageId)).toBeNull();
	});

	it('throws NotFoundError when the page does not exist', async () => {
		const useCase = new UntrackPageUseCase(repo);
		await expect(useCase.execute('missing')).rejects.toBeInstanceOf(NotFoundError);
		expect(repo.store.size).toBe(1); // original page untouched
	});

	it('only deletes the targeted page when multiple are tracked for the same project', async () => {
		const tracker = new TrackPageUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['page-2' as Uuid]),
			events,
		);
		const second = await tracker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			url: 'https://example.com/landing',
			strategy: 'desktop',
		});

		const useCase = new UntrackPageUseCase(repo);
		await useCase.execute(trackedPageId);

		expect(repo.store.size).toBe(1);
		expect(await repo.findById(second.trackedPageId as WebPerformance.TrackedPageId)).not.toBeNull();
	});
});
