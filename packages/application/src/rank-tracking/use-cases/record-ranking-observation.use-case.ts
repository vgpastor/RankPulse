import { RankTracking, type SharedKernel } from '@rankpulse/domain';
import { type Clock, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface RecordRankingObservationCommand {
	trackedKeywordId: string;
	position: number | null;
	url: string | null;
	serpFeatures?: readonly string[];
	sourceProvider: string;
	rawPayloadId: string | null;
}

export interface RecordRankingObservationResult {
	observationId: string;
	emittedEvents: readonly string[];
}

/**
 * Persists a new observation comparing against the latest stored one to emit
 * the right semantic events: KeywordPositionChanged, KeywordEnteredTopTen,
 * KeywordDroppedFromFirstPage. The alerting context subscribes to these
 * directly rather than re-deriving them from raw numbers.
 */
export class RecordRankingObservationUseCase {
	constructor(
		private readonly trackedKeywords: RankTracking.TrackedKeywordRepository,
		private readonly observations: RankTracking.RankingObservationRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: RecordRankingObservationCommand): Promise<RecordRankingObservationResult> {
		const trackedId = cmd.trackedKeywordId as RankTracking.TrackedKeywordId;
		const tracked = await this.trackedKeywords.findById(trackedId);
		if (!tracked) {
			throw new NotFoundError(`TrackedKeyword ${cmd.trackedKeywordId} not found`);
		}
		if (!tracked.isActive()) {
			return { observationId: '', emittedEvents: [] };
		}

		const previous = await this.observations.findLatestFor(trackedId);
		const observationId = this.ids.generate() as RankTracking.RankingObservationId;
		const observation = RankTracking.RankingObservation.record({
			id: observationId,
			trackedKeywordId: trackedId,
			projectId: tracked.projectId,
			domain: tracked.domain.value,
			phrase: tracked.phrase.value,
			country: tracked.location.country,
			language: tracked.location.language,
			device: tracked.device,
			position: RankTracking.Position.fromNullable(cmd.position),
			url: cmd.url,
			serpFeatures: cmd.serpFeatures ?? [],
			sourceProvider: cmd.sourceProvider,
			rawPayloadId: cmd.rawPayloadId,
			previous,
			now: this.clock.now(),
		});

		await this.observations.save(observation);
		const emitted = observation.pullEvents();
		await this.events.publish(emitted);

		return { observationId, emittedEvents: emitted.map((e) => e.type) };
	}
}
