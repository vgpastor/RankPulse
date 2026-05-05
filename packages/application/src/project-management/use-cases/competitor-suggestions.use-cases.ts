import { ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator, NotFoundError } from '@rankpulse/shared';

/**
 * BACKLOG #18 — eligibility policy. Centralised so the domain stays
 * pure and the use cases / read models reference one source of truth.
 *
 * Defaults:
 *   - `minHits: 3` — at least 3 distinct keywords have to see the
 *     domain in their top-10 before we surface it. A single SERP
 *     overlap is noise.
 *   - `minKeywordRatio: 0.3` — the domain has to overlap with ≥30%
 *     of the project's tracked keywords. Below that, even with 3
 *     hits, it's likely a niche overlap, not a real competitor.
 */
export const SUGGESTION_POLICY = {
	minHits: 3,
	minKeywordRatio: 0.3,
};

export interface SuggestionView {
	id: string;
	projectId: string;
	domain: string;
	totalTop10Hits: number;
	distinctKeywordsInTop10: number;
	firstSeenAt: string;
	lastSeenAt: string;
	status: ProjectManagement.SuggestionStatus;
}

const toView = (s: ProjectManagement.CompetitorSuggestion): SuggestionView => ({
	id: s.id,
	projectId: s.projectId,
	domain: s.domain.value,
	totalTop10Hits: s.totalTop10Hits,
	distinctKeywordsInTop10: s.keywordsInTop10.size,
	firstSeenAt: s.firstSeenAt.toISOString(),
	lastSeenAt: s.lastSeenAt.toISOString(),
	status: s.status,
});

const normalize = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/^www\./, '');

export interface RecordTop10HitsCommand {
	projectId: string;
	keyword: string;
	/**
	 * Domains observed in the top-10 of this fetch. Caller must already
	 * have filtered out (a) the project's own domains and (b) domains
	 * already tracked as `Competitor`. Pre-filtering belongs to the
	 * processor — the domain has the data, the use case has the action.
	 */
	externalDomainsInTop10: readonly string[];
}

/**
 * Side-effect of a SERP fetch (called from the worker after extraction).
 * For every external domain in top-10, find-or-create the suggestion
 * and increment its tally. PENDING suggestions absorb new hits;
 * promoted/dismissed ones ignore them (the aggregate enforces this).
 */
export class RecordTop10HitsForSuggestionsUseCase {
	constructor(
		private readonly suggestions: ProjectManagement.CompetitorSuggestionRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: RecordTop10HitsCommand): Promise<void> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const seen = new Set<string>();
		for (const raw of cmd.externalDomainsInTop10) {
			const key = normalize(raw);
			if (seen.has(key)) continue;
			seen.add(key);
			await this.recordSingleDomain(projectId, key, cmd.keyword);
		}
	}

	/**
	 * find-or-observe + record, with one retry on the unique-violation race.
	 * The race: two parallel SERP jobs of the same project both see "no row"
	 * for the same external domain → both call `observe` → second `save`
	 * hits `competitor_suggestions_project_domain_unique` and the repo
	 * throws `ConflictError`. We refetch and apply the hit on the row that
	 * the other writer just created. One retry is enough — after the row
	 * exists, every subsequent caller takes the find-existing branch.
	 */
	private async recordSingleDomain(
		projectId: ProjectManagement.ProjectId,
		domainKey: string,
		keyword: string,
	): Promise<void> {
		const existing = await this.suggestions.findByProjectAndDomain(projectId, domainKey);
		if (existing) {
			existing.recordTop10Hit(keyword, this.clock.now());
			await this.suggestions.save(existing);
			return;
		}
		const fresh = ProjectManagement.CompetitorSuggestion.observe({
			id: this.ids.generate() as ProjectManagement.CompetitorSuggestionId,
			projectId,
			domain: ProjectManagement.DomainName.create(domainKey),
			firstSeenKeyword: keyword,
			now: this.clock.now(),
		});
		try {
			await this.suggestions.save(fresh);
		} catch (err) {
			if (!(err instanceof ConflictError)) throw err;
			const winner = await this.suggestions.findByProjectAndDomain(projectId, domainKey);
			if (!winner) throw err;
			winner.recordTop10Hit(keyword, this.clock.now());
			await this.suggestions.save(winner);
		}
	}
}

export interface ListSuggestionsQuery {
	projectId: string;
	/** When true, only PENDING suggestions whose tally crosses the policy
	 *  threshold are returned. When false, returns every PENDING
	 *  regardless of eligibility (useful for debugging). */
	eligibleOnly?: boolean;
}

/**
 * Read model. Pulls suggestions for a project, optionally filtered by
 * the eligibility policy. Project keyword count comes from the
 * tracked-keyword repo so the threshold ratio reflects the live state.
 */
export class ListCompetitorSuggestionsUseCase {
	constructor(
		private readonly suggestions: ProjectManagement.CompetitorSuggestionRepository,
		/**
		 * Lambda port: gives us the live keyword count without leaking
		 * the rank-tracking aggregate into project-management. Composition
		 * root wires it to `trackedKeywordRepo.listForProject(...).length`
		 * (or ideally a `count` method to avoid loading the rows).
		 */
		private readonly projectKeywordCount: (projectId: string) => Promise<number>,
	) {}

	async execute(q: ListSuggestionsQuery): Promise<SuggestionView[]> {
		const projectId = q.projectId as ProjectManagement.ProjectId;
		const all = await this.suggestions.listForProject(projectId);
		if (!q.eligibleOnly) return all.map(toView);
		const totalKeywords = await this.projectKeywordCount(q.projectId);
		return all
			.filter((s) =>
				s.isEligible({
					projectKeywordCount: totalKeywords,
					minHits: SUGGESTION_POLICY.minHits,
					minKeywordRatio: SUGGESTION_POLICY.minKeywordRatio,
				}),
			)
			.map(toView);
	}
}

export interface PromoteSuggestionCommand {
	suggestionId: string;
	label?: string;
}

/**
 * Promotes a suggestion to a real `Competitor` in the same bounded
 * context.
 *
 * Order matters: the suggestion is marked PROMOTED FIRST, then the
 * Competitor row is created. If creating the Competitor fails:
 *   - The suggestion stays PROMOTED (terminal), so it never appears in
 *     the eligible list again — operators won't try to promote it
 *     twice and double-write the same Competitor.
 *   - A competitor row may be missing for the domain; the operator
 *     can re-add it manually via POST /projects/:id/competitors. The
 *     repo throws ConflictError on the unique (project_id, domain)
 *     index so a retry from a stale UI doesn't generate a 500.
 *
 * If the suggestion is already promoted/dismissed, `suggestion.promote`
 * throws ConflictError → controller returns 409.
 */
export class PromoteCompetitorSuggestionUseCase {
	constructor(
		private readonly suggestions: ProjectManagement.CompetitorSuggestionRepository,
		private readonly competitors: ProjectManagement.CompetitorRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: PromoteSuggestionCommand): Promise<{ competitorId: string }> {
		const suggestion = await this.suggestions.findById(
			cmd.suggestionId as ProjectManagement.CompetitorSuggestionId,
		);
		if (!suggestion) throw new NotFoundError(`Suggestion ${cmd.suggestionId} not found`);

		// 1. Mark PROMOTED first. If this fails (already promoted/dismissed),
		// we never get to create a Competitor — clean.
		suggestion.promote(this.clock.now());
		await this.suggestions.save(suggestion);

		// 2. Create the Competitor row. If the domain is already a
		// Competitor (rare: operator added it manually between steps),
		// the repo throws ConflictError — the controller returns 409 and
		// the suggestion stays PROMOTED, which is the desired terminal
		// state anyway.
		const competitorId = this.ids.generate() as ProjectManagement.CompetitorId;
		const competitor = ProjectManagement.Competitor.add({
			id: competitorId,
			projectId: suggestion.projectId,
			domain: suggestion.domain,
			label: cmd.label,
			now: this.clock.now(),
		});
		await this.competitors.save(competitor);
		await this.events.publish([
			new ProjectManagement.CompetitorAdded({
				competitorId,
				projectId: suggestion.projectId,
				domain: suggestion.domain.value,
				label: competitor.label,
				occurredAt: this.clock.now(),
			}),
		]);

		return { competitorId };
	}
}

export class DismissCompetitorSuggestionUseCase {
	constructor(
		private readonly suggestions: ProjectManagement.CompetitorSuggestionRepository,
		private readonly clock: Clock,
	) {}

	async execute(suggestionId: string): Promise<void> {
		const suggestion = await this.suggestions.findById(
			suggestionId as ProjectManagement.CompetitorSuggestionId,
		);
		if (!suggestion) throw new NotFoundError(`Suggestion ${suggestionId} not found`);
		suggestion.dismiss(this.clock.now());
		await this.suggestions.save(suggestion);
	}
}
