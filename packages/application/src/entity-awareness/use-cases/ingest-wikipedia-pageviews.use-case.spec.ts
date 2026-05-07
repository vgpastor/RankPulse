import type { EntityAwareness, IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestWikipediaPageviewsUseCase } from './ingest-wikipedia-pageviews.use-case.js';
import { LinkWikipediaArticleUseCase } from './link-wikipedia-article.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

class InMemoryArticleRepo implements EntityAwareness.WikipediaArticleRepository {
	readonly store = new Map<string, EntityAwareness.WikipediaArticle>();
	async save(a: EntityAwareness.WikipediaArticle): Promise<void> {
		this.store.set(a.id, a);
	}
	async findById(id: EntityAwareness.WikipediaArticleId) {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndSlug(
		projectId: ProjectManagement.ProjectId,
		wpProject: EntityAwareness.WikipediaProject,
		slug: EntityAwareness.ArticleSlug,
	) {
		for (const a of this.store.values()) {
			if (
				a.projectId === projectId &&
				a.wikipediaProject.value === wpProject.value &&
				a.slug.value === slug.value
			)
				return a;
		}
		return null;
	}
	async listForProject() {
		return [...this.store.values()];
	}
	async listForOrganization() {
		return [...this.store.values()];
	}
}

class InMemoryObservationRepo implements EntityAwareness.WikipediaPageviewObservationRepository {
	readonly store = new Map<string, EntityAwareness.WikipediaPageviewObservation>();
	async saveAll(
		observations: readonly EntityAwareness.WikipediaPageviewObservation[],
	): Promise<{ inserted: number }> {
		let inserted = 0;
		for (const o of observations) {
			const k = `${o.articleId}|${o.observedAt.toISOString()}`;
			if (this.store.has(k)) continue;
			this.store.set(k, o);
			inserted += 1;
		}
		return { inserted };
	}
	async listForArticle() {
		return [...this.store.values()];
	}
}

describe('IngestWikipediaPageviewsUseCase', () => {
	let articleRepo: InMemoryArticleRepo;
	let obsRepo: InMemoryObservationRepo;
	let events: RecordingEventPublisher;
	let articleId: string;

	beforeEach(async () => {
		articleRepo = new InMemoryArticleRepo();
		obsRepo = new InMemoryObservationRepo();
		events = new RecordingEventPublisher();
		const linker = new LinkWikipediaArticleUseCase(
			articleRepo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['art-1' as Uuid]),
			events,
		);
		const result = await linker.execute({
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			wikipediaProject: 'es.wikipedia.org',
			slug: 'Torre_Eiffel',
		});
		articleId = result.articleId;
		events.clear();
	});

	const buildUseCase = () =>
		new IngestWikipediaPageviewsUseCase(articleRepo, obsRepo, events, new FakeClock('2026-05-04T11:00:00Z'));

	const baseRow = (
		overrides: Partial<{ observedAt: Date; views: number }> = {},
	): {
		observedAt: Date;
		views: number;
		access: string;
		agent: string;
		granularity: string;
	} => ({
		observedAt: overrides.observedAt ?? new Date('2026-05-01T00:00:00Z'),
		views: overrides.views ?? 100,
		access: 'all-access',
		agent: 'user',
		granularity: 'daily',
	});

	it('persists rows and publishes WikipediaPageviewsBatchIngested with totals', async () => {
		const useCase = buildUseCase();

		const result = await useCase.execute({
			articleId,
			rows: [baseRow(), baseRow({ observedAt: new Date('2026-05-02T00:00:00Z'), views: 50 })],
		});

		expect(result.ingested).toBe(2);
		expect(obsRepo.store.size).toBe(2);
		const stored = [...obsRepo.store.values()];
		expect(stored.every((o) => o.articleId === articleId)).toBe(true);
		expect(stored.every((o) => o.projectId === PROJECT_ID)).toBe(true);

		const [evt] = events.published() as readonly EntityAwareness.WikipediaPageviewsBatchIngested[];
		expect(evt?.type).toBe('WikipediaPageviewsBatchIngested');
		expect(evt?.rowsCount).toBe(2);
		expect(evt?.totalViews).toBe(150);
	});

	it('returns 0 and does not publish when called with an empty batch', async () => {
		const useCase = buildUseCase();
		const result = await useCase.execute({ articleId, rows: [] });
		expect(result.ingested).toBe(0);
		expect(events.published()).toEqual([]);
		expect(obsRepo.store.size).toBe(0);
	});

	it('throws NotFoundError when the article does not exist', async () => {
		const useCase = buildUseCase();
		await expect(useCase.execute({ articleId: 'missing', rows: [baseRow()] })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it('returns 0 (no-op) when the article has been unlinked between schedule and fetch', async () => {
		const stored = await articleRepo.findById(articleId as EntityAwareness.WikipediaArticleId);
		stored?.unlink(new Date('2026-05-04T12:00:00Z'));
		await articleRepo.save(stored as EntityAwareness.WikipediaArticle);
		stored?.pullEvents(); // discard the unlink event so we only assert ingest emissions

		const useCase = buildUseCase();
		const result = await useCase.execute({ articleId, rows: [baseRow()] });

		expect(result.ingested).toBe(0);
		expect(obsRepo.store.size).toBe(0);
		expect(events.published()).toEqual([]);
	});

	it('reports inserted=0 when re-running the same window (idempotent on (articleId, observedAt))', async () => {
		const useCase = buildUseCase();
		await useCase.execute({ articleId, rows: [baseRow()] });
		events.clear();

		const second = await useCase.execute({ articleId, rows: [baseRow()] });

		expect(second.ingested).toBe(0);
		const [evt] = events.published() as readonly EntityAwareness.WikipediaPageviewsBatchIngested[];
		expect(evt?.rowsCount).toBe(0);
	});

	it('rejects rows with negative views via the aggregate boundary', async () => {
		const useCase = buildUseCase();
		await expect(useCase.execute({ articleId, rows: [baseRow({ views: -1 })] })).rejects.toThrow();
		expect(obsRepo.store.size).toBe(0);
	});
});
