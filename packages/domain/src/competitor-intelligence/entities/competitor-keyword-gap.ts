import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { CompetitorKeywordGapId } from '../value-objects/identifiers.js';

export interface CompetitorKeywordGapProps {
	id: CompetitorKeywordGapId;
	projectId: ProjectId;
	ourDomain: string;
	competitorDomain: string;
	keyword: string;
	country: string;
	language: string;
	/** Position our domain holds (top-100). Null when we do NOT rank in top-100 (the gap proper). */
	ourPosition: number | null;
	/** Position the competitor holds (top-100). Null only if the upstream payload omits it. */
	theirPosition: number | null;
	searchVolume: number | null;
	cpc: number | null;
	keywordDifficulty: number | null;
	sourceProvider: string;
	rawPayloadId: string | null;
	observedAt: Date;
}

/**
 * Issue #128: one observation of a keyword where the competitor ranks (top-100)
 * but our domain either does not, or ranks worse. Sourced from DataForSEO Labs
 * `domain_intersection/live`. Mirrors the passive read-model style of
 * `RankedKeywordObservation` (no domain events) — the table is the projection;
 * alerting hooks would be derived materialisations over this hypertable.
 */
export class CompetitorKeywordGap extends AggregateRoot {
	private constructor(private readonly props: CompetitorKeywordGapProps) {
		super();
	}

	static record(input: CompetitorKeywordGapProps): CompetitorKeywordGap {
		return new CompetitorKeywordGap({ ...input });
	}

	static rehydrate(props: CompetitorKeywordGapProps): CompetitorKeywordGap {
		return new CompetitorKeywordGap({ ...props });
	}

	get id(): CompetitorKeywordGapId {
		return this.props.id;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get ourDomain(): string {
		return this.props.ourDomain;
	}
	get competitorDomain(): string {
		return this.props.competitorDomain;
	}
	get keyword(): string {
		return this.props.keyword;
	}
	get country(): string {
		return this.props.country;
	}
	get language(): string {
		return this.props.language;
	}
	get ourPosition(): number | null {
		return this.props.ourPosition;
	}
	get theirPosition(): number | null {
		return this.props.theirPosition;
	}
	get searchVolume(): number | null {
		return this.props.searchVolume;
	}
	get cpc(): number | null {
		return this.props.cpc;
	}
	get keywordDifficulty(): number | null {
		return this.props.keywordDifficulty;
	}
	get sourceProvider(): string {
		return this.props.sourceProvider;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
	get observedAt(): Date {
		return this.props.observedAt;
	}

	/**
	 * ROI heuristic prioritising "keywords worth fagocitar" — high volume × CPC,
	 * cheap to rank for. Returns null when search volume or CPC is missing
	 * because the score becomes meaningless without monetisation signal.
	 * Difficulty is offset by 1 so a brand-new keyword (KD=0) doesn't divide
	 * by zero and dominate ranking.
	 */
	get roiScore(): number | null {
		const v = this.props.searchVolume;
		const c = this.props.cpc;
		if (v == null || c == null) return null;
		const kd = this.props.keywordDifficulty ?? 0;
		return (v * c) / (kd + 1);
	}
}
