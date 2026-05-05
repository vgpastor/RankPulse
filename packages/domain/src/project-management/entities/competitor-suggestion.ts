import { ConflictError, InvalidInputError } from '@rankpulse/shared';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { DomainName } from '../value-objects/domain-name.js';
import type { CompetitorSuggestionId, ProjectId } from '../value-objects/identifiers.js';

export const SuggestionStatuses = {
	PENDING: 'PENDING',
	PROMOTED: 'PROMOTED',
	DISMISSED: 'DISMISSED',
} as const;
export type SuggestionStatus = (typeof SuggestionStatuses)[keyof typeof SuggestionStatuses];

export interface CompetitorSuggestionProps {
	id: CompetitorSuggestionId;
	projectId: ProjectId;
	domain: DomainName;
	/** Distinct project keywords where this domain has hit top-10 at least once. */
	keywordsInTop10: ReadonlySet<string>;
	/** Total times this domain has shown up in any SERP top-10 across fetches. */
	totalTop10Hits: number;
	firstSeenAt: Date;
	lastSeenAt: Date;
	status: SuggestionStatus;
	promotedAt: Date | null;
	dismissedAt: Date | null;
}

/**
 * BACKLOG #18 — running tally of how often a domain has appeared in the
 * top-10 of any SERP fetched for a project. The aggregate is the
 * read-write surface; the application layer decides whether a tally
 * crosses the eligibility threshold (`isEligible(projectKeywordCount,
 * minHits, minRatio)`) and whether to surface it to the user.
 *
 * State machine:
 *   PENDING → PROMOTED (creates a Competitor in the same bounded context)
 *   PENDING → DISMISSED (operator says "not relevant")
 * Both transitions are terminal; promoting/dismissing twice is a
 * `ConflictError`.
 *
 * Invariants enforced here, not in the use case:
 *   - `domain` cannot belong to the project itself (caller must filter).
 *   - `keywordsInTop10` shrinks only via `dismiss`/`promote`; otherwise
 *     monotonic growth.
 *   - `totalTop10Hits` is monotonic.
 */
export class CompetitorSuggestion extends AggregateRoot {
	private constructor(private props: CompetitorSuggestionProps) {
		super();
	}

	static observe(input: {
		id: CompetitorSuggestionId;
		projectId: ProjectId;
		domain: DomainName;
		firstSeenKeyword: string;
		now: Date;
	}): CompetitorSuggestion {
		if (input.firstSeenKeyword.trim().length === 0) {
			throw new InvalidInputError('firstSeenKeyword cannot be empty');
		}
		return new CompetitorSuggestion({
			id: input.id,
			projectId: input.projectId,
			domain: input.domain,
			keywordsInTop10: new Set([input.firstSeenKeyword]),
			totalTop10Hits: 1,
			firstSeenAt: input.now,
			lastSeenAt: input.now,
			status: SuggestionStatuses.PENDING,
			promotedAt: null,
			dismissedAt: null,
		});
	}

	static rehydrate(props: CompetitorSuggestionProps): CompetitorSuggestion {
		return new CompetitorSuggestion({
			...props,
			keywordsInTop10: new Set(props.keywordsInTop10),
		});
	}

	/**
	 * Records another top-10 appearance for this domain on the given
	 * keyword. Idempotent w.r.t. the keyword set (the same keyword
	 * appearing in multiple fetches doesn't inflate the distinct-keyword
	 * count) but increments `totalTop10Hits` every call — the latter is
	 * what tells us whether the signal is sustained vs. a one-off blip.
	 */
	recordTop10Hit(keyword: string, now: Date): void {
		if (this.props.status !== SuggestionStatuses.PENDING) {
			// Promoted/dismissed suggestions are frozen; further hits don't
			// re-open them. The use case decides whether to spawn a new
			// suggestion for the next manual review cycle.
			return;
		}
		const next = new Set(this.props.keywordsInTop10);
		next.add(keyword);
		this.props = {
			...this.props,
			keywordsInTop10: next,
			totalTop10Hits: this.props.totalTop10Hits + 1,
			lastSeenAt: now,
		};
	}

	/**
	 * Threshold gate. Reads the project's current keyword total (passed
	 * in — the aggregate doesn't reach across contexts) and the policy
	 * limits, returns whether this suggestion should be surfaced.
	 *
	 * Default policy lives in the application layer; the aggregate only
	 * knows how to evaluate it.
	 */
	isEligible(input: { projectKeywordCount: number; minHits: number; minKeywordRatio: number }): boolean {
		if (this.props.status !== SuggestionStatuses.PENDING) return false;
		if (input.projectKeywordCount === 0) return false;
		if (this.props.keywordsInTop10.size < input.minHits) return false;
		const ratio = this.props.keywordsInTop10.size / input.projectKeywordCount;
		return ratio >= input.minKeywordRatio;
	}

	promote(now: Date): void {
		if (this.props.status !== SuggestionStatuses.PENDING) {
			throw new ConflictError(`Suggestion is already ${this.props.status}, cannot promote`);
		}
		this.props = { ...this.props, status: SuggestionStatuses.PROMOTED, promotedAt: now };
	}

	dismiss(now: Date): void {
		if (this.props.status !== SuggestionStatuses.PENDING) {
			throw new ConflictError(`Suggestion is already ${this.props.status}, cannot dismiss`);
		}
		this.props = { ...this.props, status: SuggestionStatuses.DISMISSED, dismissedAt: now };
	}

	get id(): CompetitorSuggestionId {
		return this.props.id;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get domain(): DomainName {
		return this.props.domain;
	}
	get keywordsInTop10(): ReadonlySet<string> {
		return this.props.keywordsInTop10;
	}
	get totalTop10Hits(): number {
		return this.props.totalTop10Hits;
	}
	get firstSeenAt(): Date {
		return this.props.firstSeenAt;
	}
	get lastSeenAt(): Date {
		return this.props.lastSeenAt;
	}
	get status(): SuggestionStatus {
		return this.props.status;
	}
	get promotedAt(): Date | null {
		return this.props.promotedAt;
	}
	get dismissedAt(): Date | null {
		return this.props.dismissedAt;
	}
}
