import { type ProjectManagement, RankTracking } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';

export interface SerpResultInput {
	rank: number;
	domain: string;
	url: string | null;
	title: string | null;
}

export interface RecordSerpObservationCommand {
	projectId: string;
	phrase: string;
	country: string;
	language: string;
	device: RankTracking.Device;
	results: readonly SerpResultInput[];
	sourceProvider: string;
	rawPayloadId: string | null;
}

export interface RecordSerpObservationResult {
	observationId: string;
	persistedRows: number;
}

/**
 * Persists a SERP top-N snapshot for a (project, keyword, locale, device)
 * tuple. The aggregate truncates `observedAt` to start-of-day-UTC so re-runs
 * on the same day idempotently overwrite the previous snapshot — required by
 * the issue #115 acceptance criteria.
 *
 * Empty results are accepted (the SERP fetch returned a payload with zero
 * organic items — typically a quota error masked as a 200) and produce a
 * persistedRows=0 receipt; callers should NOT throw, the rank-tracking
 * observation use case already records the per-domain "not ranked" state.
 */
export class RecordSerpObservationUseCase {
	constructor(
		private readonly observations: RankTracking.SerpObservationRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: RecordSerpObservationCommand): Promise<RecordSerpObservationResult> {
		const observationId = this.ids.generate() as RankTracking.SerpObservationId;
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const observation = RankTracking.SerpObservation.record({
			id: observationId,
			projectId,
			phrase: cmd.phrase,
			country: cmd.country,
			language: cmd.language,
			device: cmd.device,
			results: cmd.results.map((r) =>
				RankTracking.SerpResult.create({
					rank: r.rank,
					domain: r.domain,
					url: r.url,
					title: r.title,
				}),
			),
			sourceProvider: cmd.sourceProvider,
			rawPayloadId: cmd.rawPayloadId,
			now: this.clock.now(),
		});
		await this.observations.save(observation);
		return { observationId, persistedRows: observation.results.length };
	}
}
