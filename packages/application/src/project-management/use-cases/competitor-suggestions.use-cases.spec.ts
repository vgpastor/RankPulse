import { ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { RecordingEventPublisher } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import {
	DismissCompetitorSuggestionUseCase,
	ListCompetitorSuggestionsUseCase,
	PromoteCompetitorSuggestionUseCase,
	RecordTop10HitsForSuggestionsUseCase,
	SUGGESTION_POLICY,
} from './competitor-suggestions.use-cases.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as ProjectManagement.ProjectId;

class InMemorySuggestionRepo implements ProjectManagement.CompetitorSuggestionRepository {
	readonly store = new Map<string, ProjectManagement.CompetitorSuggestion>();
	async save(s: ProjectManagement.CompetitorSuggestion): Promise<void> {
		this.store.set(s.id, s);
	}
	async findById(id: ProjectManagement.CompetitorSuggestionId) {
		return this.store.get(id) ?? null;
	}
	async findByProjectAndDomain(_projectId: ProjectManagement.ProjectId, domain: string) {
		for (const s of this.store.values()) {
			if (s.projectId === _projectId && s.domain.value === domain) return s;
		}
		return null;
	}
	async listForProject(projectId: ProjectManagement.ProjectId) {
		return [...this.store.values()].filter((s) => s.projectId === projectId);
	}
}

class InMemoryCompetitorRepo implements ProjectManagement.CompetitorRepository {
	readonly store = new Map<string, ProjectManagement.Competitor>();
	async save(c: ProjectManagement.Competitor): Promise<void> {
		this.store.set(c.id, c);
	}
	async findById(id: ProjectManagement.CompetitorId) {
		return this.store.get(id) ?? null;
	}
	async findByDomain(projectId: ProjectManagement.ProjectId, domain: ProjectManagement.DomainName) {
		for (const c of this.store.values()) {
			if (c.projectId === projectId && c.domain.value === domain.value) return c;
		}
		return null;
	}
	async listForProject(projectId: ProjectManagement.ProjectId) {
		return [...this.store.values()].filter((c) => c.projectId === projectId);
	}
}

const buildClock = (now = '2026-05-04T10:00:00Z') => new FakeClock(now);
const buildIds = (...uuids: string[]) => new FixedIdGenerator(uuids as Uuid[]);

describe('RecordTop10HitsForSuggestionsUseCase', () => {
	it('creates a new PENDING suggestion the first time a domain shows up', async () => {
		const repo = new InMemorySuggestionRepo();
		const useCase = new RecordTop10HitsForSuggestionsUseCase(repo, buildClock(), buildIds('sugg-1' as never));

		await useCase.execute({
			projectId: PROJECT_ID,
			keyword: 'control de rondas',
			externalDomainsInTop10: ['competitor.com'],
		});

		expect(repo.store.size).toBe(1);
		const created = [...repo.store.values()][0];
		expect(created?.domain.value).toBe('competitor.com');
		expect(created?.keywordsInTop10.size).toBe(1);
		expect(created?.totalTop10Hits).toBe(1);
	});

	it('increments existing suggestion on subsequent hits, never creates a duplicate', async () => {
		const repo = new InMemorySuggestionRepo();
		const useCase = new RecordTop10HitsForSuggestionsUseCase(
			repo,
			buildClock(),
			buildIds('sugg-1' as never, 'sugg-2' as never),
		);

		await useCase.execute({
			projectId: PROJECT_ID,
			keyword: 'kw-a',
			externalDomainsInTop10: ['competitor.com'],
		});
		await useCase.execute({
			projectId: PROJECT_ID,
			keyword: 'kw-b',
			externalDomainsInTop10: ['competitor.com'],
		});

		expect(repo.store.size).toBe(1);
		const s = [...repo.store.values()][0];
		expect(s?.keywordsInTop10.size).toBe(2);
		expect(s?.totalTop10Hits).toBe(2);
	});

	it('normalizes domains (lowercase + strips www.) so Foo.com and www.foo.com collapse', async () => {
		const repo = new InMemorySuggestionRepo();
		const useCase = new RecordTop10HitsForSuggestionsUseCase(repo, buildClock(), buildIds('sugg-1' as never));

		await useCase.execute({
			projectId: PROJECT_ID,
			keyword: 'kw-a',
			externalDomainsInTop10: ['Foo.com', 'www.foo.com', 'foo.com'],
		});

		expect(repo.store.size).toBe(1);
		expect([...repo.store.values()][0]?.domain.value).toBe('foo.com');
	});

	it('recovers from a (project, domain) unique-violation race by recording on the winner row', async () => {
		// Simulates a parallel insert: the repo's `save` throws ConflictError
		// the FIRST time the use case tries to persist a freshly-observed
		// suggestion (because another worker beat it to the unique
		// (project_id, domain) row). The use case must refetch + apply the
		// hit on the now-existing row instead of propagating the error.
		const repo = new InMemorySuggestionRepo();
		// Seed the row that the "other worker" supposedly created first.
		const winner = ProjectManagement.CompetitorSuggestion.observe({
			id: 'sugg-winner' as ProjectManagement.CompetitorSuggestionId,
			projectId: PROJECT_ID,
			domain: ProjectManagement.DomainName.create('competitor.com'),
			firstSeenKeyword: 'kw-other-worker',
			now: new Date('2026-05-04T09:59:00Z'),
		});
		await repo.save(winner);

		let raisedConflict = false;
		const racingRepo: ProjectManagement.CompetitorSuggestionRepository = {
			...repo,
			save: async (s) => {
				// Trigger the race only on the new row the use case is trying
				// to persist (different id from the seeded winner). Existing
				// row updates and the retry path go through unchanged.
				if (!raisedConflict && s.id !== winner.id && !repo.store.has(s.id)) {
					raisedConflict = true;
					throw new ConflictError('Suggestion for (proj, competitor.com) already exists');
				}
				await repo.save(s);
			},
			findById: (id) => repo.findById(id),
			findByProjectAndDomain: (projectId, domain) => repo.findByProjectAndDomain(projectId, domain),
			listForProject: (projectId) => repo.listForProject(projectId),
		};

		// First call sees no row in `findByProjectAndDomain` (we'll force the
		// race by emptying the store before save).
		repo.store.clear();
		await repo.save(winner);
		repo.store.delete(winner.id);
		repo.store.set(winner.id, winner);

		const useCase = new RecordTop10HitsForSuggestionsUseCase(
			racingRepo,
			buildClock(),
			buildIds('sugg-loser' as never),
		);

		// Override findByProjectAndDomain to return null on first call (race
		// window) and the winner on retry.
		let firstFind = true;
		racingRepo.findByProjectAndDomain = async (projectId, domain) => {
			if (firstFind) {
				firstFind = false;
				return null;
			}
			return repo.findByProjectAndDomain(projectId, domain);
		};

		await useCase.execute({
			projectId: PROJECT_ID,
			keyword: 'kw-this-worker',
			externalDomainsInTop10: ['competitor.com'],
		});

		expect(raisedConflict).toBe(true);
		const final = repo.store.get(winner.id);
		expect(final?.keywordsInTop10.has('kw-this-worker')).toBe(true);
		expect(final?.keywordsInTop10.has('kw-other-worker')).toBe(true);
	});

	it('skips already-promoted suggestions (no resurrection)', async () => {
		const repo = new InMemorySuggestionRepo();
		const useCase = new RecordTop10HitsForSuggestionsUseCase(repo, buildClock(), buildIds('sugg-1' as never));
		await useCase.execute({
			projectId: PROJECT_ID,
			keyword: 'kw-a',
			externalDomainsInTop10: ['competitor.com'],
		});
		const sugg = [...repo.store.values()][0];
		sugg?.promote(new Date('2026-05-05T00:00:00Z'));
		await repo.save(sugg as ProjectManagement.CompetitorSuggestion);

		await useCase.execute({
			projectId: PROJECT_ID,
			keyword: 'kw-b',
			externalDomainsInTop10: ['competitor.com'],
		});

		// Frozen — keyword count stayed at 1 (the aggregate's recordTop10Hit
		// is a no-op for non-PENDING).
		expect([...repo.store.values()][0]?.keywordsInTop10.size).toBe(1);
	});
});

describe('ListCompetitorSuggestionsUseCase', () => {
	const seedSuggestions = async (
		repo: InMemorySuggestionRepo,
		hits: { domain: string; keywords: string[] }[],
	) => {
		const ids = buildIds(...hits.map((_, i) => `sugg-${i}` as never));
		const recorder = new RecordTop10HitsForSuggestionsUseCase(repo, buildClock(), ids);
		for (const h of hits) {
			for (const kw of h.keywords) {
				await recorder.execute({ projectId: PROJECT_ID, keyword: kw, externalDomainsInTop10: [h.domain] });
			}
		}
	};

	it('returns all PENDING suggestions when eligibleOnly=false', async () => {
		const repo = new InMemorySuggestionRepo();
		await seedSuggestions(repo, [
			{ domain: 'a.com', keywords: ['kw-1'] }, // 1 keyword — below minHits
			{ domain: 'b.com', keywords: ['kw-1', 'kw-2', 'kw-3'] }, // eligible
		]);
		const useCase = new ListCompetitorSuggestionsUseCase(repo, async () => 10);

		const all = await useCase.execute({ projectId: PROJECT_ID, eligibleOnly: false });

		expect(all).toHaveLength(2);
	});

	it('eligibleOnly=true filters by SUGGESTION_POLICY (minHits=3, ratio=0.3)', async () => {
		const repo = new InMemorySuggestionRepo();
		await seedSuggestions(repo, [
			// Below minHits.
			{ domain: 'small.com', keywords: ['kw-1', 'kw-2'] },
			// Above hits but below ratio (project has 100 keywords).
			{ domain: 'niche.com', keywords: ['kw-1', 'kw-2', 'kw-3'] },
			// Eligible: 4 distinct keywords / 10 project keywords = 0.4 ≥ 0.3.
			{ domain: 'real-competitor.com', keywords: ['kw-1', 'kw-2', 'kw-3', 'kw-4'] },
		]);

		// First call — project has 10 keywords. small fails minHits, niche
		// passes hits, real passes both.
		const tenKeywordProject = new ListCompetitorSuggestionsUseCase(repo, async () => 10);
		const eligible10 = await tenKeywordProject.execute({ projectId: PROJECT_ID, eligibleOnly: true });
		expect(eligible10.map((s) => s.domain).sort()).toEqual(['niche.com', 'real-competitor.com']);

		// Second call — same data but project has 100 keywords. niche.com
		// drops below the ratio (3/100 = 0.03), real-competitor.com too
		// (4/100 = 0.04). NONE eligible.
		const hundredKeywordProject = new ListCompetitorSuggestionsUseCase(repo, async () => 100);
		const eligible100 = await hundredKeywordProject.execute({ projectId: PROJECT_ID, eligibleOnly: true });
		expect(eligible100).toEqual([]);
	});

	it('SUGGESTION_POLICY default is locked (3 hits, 30% ratio)', () => {
		expect(SUGGESTION_POLICY).toEqual({ minHits: 3, minKeywordRatio: 0.3 });
	});
});

describe('PromoteCompetitorSuggestionUseCase', () => {
	const setup = async () => {
		const suggestionRepo = new InMemorySuggestionRepo();
		const competitorRepo = new InMemoryCompetitorRepo();
		const events = new RecordingEventPublisher();
		const recorder = new RecordTop10HitsForSuggestionsUseCase(
			suggestionRepo,
			buildClock(),
			buildIds('sugg-1' as never),
		);
		await recorder.execute({
			projectId: PROJECT_ID,
			keyword: 'control de rondas',
			externalDomainsInTop10: ['competitor.com'],
		});
		const suggestion = [...suggestionRepo.store.values()][0] as ProjectManagement.CompetitorSuggestion;

		const promoter = new PromoteCompetitorSuggestionUseCase(
			suggestionRepo,
			competitorRepo,
			buildClock(),
			buildIds('comp-1' as never),
			events,
		);
		return { suggestion, suggestionRepo, competitorRepo, events, promoter };
	};

	it('creates a Competitor + marks suggestion as PROMOTED', async () => {
		const { suggestion, suggestionRepo, competitorRepo, promoter } = await setup();

		const result = await promoter.execute({ suggestionId: suggestion.id, label: 'Big Bad Competitor' });

		expect(result.competitorId).toBe('comp-1');
		expect(competitorRepo.store.size).toBe(1);
		expect([...competitorRepo.store.values()][0]?.label).toBe('Big Bad Competitor');
		expect(suggestionRepo.store.get(suggestion.id)?.status).toBe('PROMOTED');
	});

	it('uses the suggestion domain as label when none provided', async () => {
		const { suggestion, competitorRepo, promoter } = await setup();
		await promoter.execute({ suggestionId: suggestion.id });
		expect([...competitorRepo.store.values()][0]?.label).toBe('competitor.com');
	});

	it('throws NotFoundError when the suggestion does not exist', async () => {
		const { promoter } = await setup();
		await expect(promoter.execute({ suggestionId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
	});

	it('emits CompetitorAdded event for downstream consumers', async () => {
		const { suggestion, events, promoter } = await setup();
		await promoter.execute({ suggestionId: suggestion.id });
		expect(events.publishedTypes()).toContain('project-management.CompetitorAdded');
	});
});

describe('DismissCompetitorSuggestionUseCase', () => {
	it('marks suggestion as DISMISSED', async () => {
		const repo = new InMemorySuggestionRepo();
		const recorder = new RecordTop10HitsForSuggestionsUseCase(
			repo,
			buildClock(),
			buildIds('sugg-1' as never),
		);
		await recorder.execute({
			projectId: PROJECT_ID,
			keyword: 'kw-a',
			externalDomainsInTop10: ['competitor.com'],
		});
		const suggestion = [...repo.store.values()][0] as ProjectManagement.CompetitorSuggestion;
		const dismisser = new DismissCompetitorSuggestionUseCase(repo, buildClock());

		await dismisser.execute(suggestion.id);

		expect(repo.store.get(suggestion.id)?.status).toBe('DISMISSED');
	});

	it('throws NotFoundError when the suggestion does not exist', async () => {
		const dismisser = new DismissCompetitorSuggestionUseCase(new InMemorySuggestionRepo(), buildClock());
		await expect(dismisser.execute('missing')).rejects.toBeInstanceOf(NotFoundError);
	});
});
