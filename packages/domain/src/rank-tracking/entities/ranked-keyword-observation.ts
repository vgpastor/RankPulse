import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { RankedKeywordObservationId } from '../value-objects/identifiers.js';

export interface RankedKeywordObservationProps {
	id: RankedKeywordObservationId;
	projectId: ProjectId;
	targetDomain: string;
	keyword: string;
	country: string;
	language: string;
	position: number | null;
	searchVolume: number | null;
	keywordDifficulty: number | null;
	trafficEstimate: number | null;
	cpc: number | null;
	rankingUrl: string | null;
	sourceProvider: string;
	rawPayloadId: string | null;
	observedAt: Date;
}

/**
 * Issue #127: one immutable snapshot of a (target domain × keyword) row from
 * the DataForSEO Labs ranked-keywords endpoint. Unlike `RankingObservation`
 * (which is anchored to a `TrackedKeyword` and emits semantic events), this
 * entity is a passive read-model row — the full keyword universe of a domain
 * is too broad to attach alerting events to. Alerting hooks can be added
 * later as derived materialisations if the product needs them.
 */
export class RankedKeywordObservation extends AggregateRoot {
	private constructor(private readonly props: RankedKeywordObservationProps) {
		super();
	}

	static record(input: RankedKeywordObservationProps): RankedKeywordObservation {
		return new RankedKeywordObservation({ ...input });
	}

	static rehydrate(props: RankedKeywordObservationProps): RankedKeywordObservation {
		return new RankedKeywordObservation({ ...props });
	}

	get id(): RankedKeywordObservationId {
		return this.props.id;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get targetDomain(): string {
		return this.props.targetDomain;
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
	get position(): number | null {
		return this.props.position;
	}
	get searchVolume(): number | null {
		return this.props.searchVolume;
	}
	get keywordDifficulty(): number | null {
		return this.props.keywordDifficulty;
	}
	get trafficEstimate(): number | null {
		return this.props.trafficEstimate;
	}
	get cpc(): number | null {
		return this.props.cpc;
	}
	get rankingUrl(): string | null {
		return this.props.rankingUrl;
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
}
