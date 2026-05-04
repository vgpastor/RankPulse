import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { KeywordDroppedFromFirstPage } from '../events/keyword-dropped-from-first-page.js';
import { KeywordEnteredTopTen } from '../events/keyword-entered-top-ten.js';
import { KeywordPositionChanged } from '../events/keyword-position-changed.js';
import type { Device } from '../value-objects/device.js';
import type { RankingObservationId, TrackedKeywordId } from '../value-objects/identifiers.js';
import type { Position } from '../value-objects/position.js';

export interface RankingObservationProps {
	id: RankingObservationId;
	trackedKeywordId: TrackedKeywordId;
	projectId: ProjectId;
	domain: string;
	phrase: string;
	country: string;
	language: string;
	device: Device;
	position: Position;
	url: string | null;
	serpFeatures: readonly string[];
	sourceProvider: string;
	rawPayloadId: string | null;
	observedAt: Date;
}

/**
 * One immutable observation of a tracked keyword's SERP state. Comparing
 * against the previous observation produces semantic events for the alerting
 * context (KeywordPositionChanged, KeywordEnteredTopTen, etc.).
 */
export class RankingObservation extends AggregateRoot {
	private constructor(private readonly props: RankingObservationProps) {
		super();
	}

	static record(input: {
		id: RankingObservationId;
		trackedKeywordId: TrackedKeywordId;
		projectId: ProjectId;
		domain: string;
		phrase: string;
		country: string;
		language: string;
		device: Device;
		position: Position;
		url: string | null;
		serpFeatures?: readonly string[];
		sourceProvider: string;
		rawPayloadId: string | null;
		previous?: RankingObservation | null;
		now: Date;
	}): RankingObservation {
		const observation = new RankingObservation({
			id: input.id,
			trackedKeywordId: input.trackedKeywordId,
			projectId: input.projectId,
			domain: input.domain,
			phrase: input.phrase,
			country: input.country,
			language: input.language,
			device: input.device,
			position: input.position,
			url: input.url,
			serpFeatures: [...(input.serpFeatures ?? [])],
			sourceProvider: input.sourceProvider,
			rawPayloadId: input.rawPayloadId,
			observedAt: input.now,
		});

		const prev = input.previous ?? null;
		if (prev && !prev.props.position.equals(input.position)) {
			observation.record(
				new KeywordPositionChanged({
					trackedKeywordId: input.trackedKeywordId,
					projectId: input.projectId,
					phrase: input.phrase,
					previousPosition: prev.props.position.value,
					currentPosition: input.position.value,
					occurredAt: input.now,
				}),
			);
		}
		if (prev && !prev.props.position.isInTopTen() && input.position.isInTopTen()) {
			observation.record(
				new KeywordEnteredTopTen({
					trackedKeywordId: input.trackedKeywordId,
					projectId: input.projectId,
					phrase: input.phrase,
					currentPosition: input.position.value ?? 10,
					occurredAt: input.now,
				}),
			);
		}
		if (prev?.props.position.isOnFirstPage() && !input.position.isOnFirstPage()) {
			observation.record(
				new KeywordDroppedFromFirstPage({
					trackedKeywordId: input.trackedKeywordId,
					projectId: input.projectId,
					phrase: input.phrase,
					previousPosition: prev.props.position.value,
					currentPosition: input.position.value,
					occurredAt: input.now,
				}),
			);
		}

		return observation;
	}

	static rehydrate(props: RankingObservationProps): RankingObservation {
		return new RankingObservation({ ...props, serpFeatures: [...props.serpFeatures] });
	}

	get id(): RankingObservationId {
		return this.props.id;
	}
	get trackedKeywordId(): TrackedKeywordId {
		return this.props.trackedKeywordId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get position(): Position {
		return this.props.position;
	}
	get url(): string | null {
		return this.props.url;
	}
	get serpFeatures(): readonly string[] {
		return this.props.serpFeatures;
	}
	get observedAt(): Date {
		return this.props.observedAt;
	}
	get device(): Device {
		return this.props.device;
	}
	get country(): string {
		return this.props.country;
	}
	get language(): string {
		return this.props.language;
	}
	get domain(): string {
		return this.props.domain;
	}
	get phrase(): string {
		return this.props.phrase;
	}
	get sourceProvider(): string {
		return this.props.sourceProvider;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
}
