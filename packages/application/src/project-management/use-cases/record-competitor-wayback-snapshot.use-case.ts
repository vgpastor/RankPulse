import { ProjectManagement } from '@rankpulse/domain';
import { type Clock, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface RecordCompetitorWaybackSnapshotCommand {
	competitorId: string;
	rawPayloadId: string | null;
	summary: {
		snapshotCount: number;
		latestSnapshotAt: string | null;
		earliestSnapshotAt: string | null;
	};
}

/**
 * Persists one Wayback CDX snapshot summary as a competitor-activity
 * observation. `competitorId` is resolved from the worker's
 * `systemParams` (set by the auto-schedule when the operator activates
 * activity tracking on a competitor) — the use case looks the competitor
 * up to derive `projectId` so callers don't have to thread it.
 *
 * Idempotent on `(competitor, source, observed_at::date)`: the aggregate
 * truncates `observedAt` to start-of-day-UTC and the repository upserts
 * on conflict.
 */
export class RecordCompetitorWaybackSnapshotUseCase {
	constructor(
		private readonly competitors: ProjectManagement.CompetitorRepository,
		private readonly observations: ProjectManagement.CompetitorActivityObservationRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: RecordCompetitorWaybackSnapshotCommand): Promise<{ observationId: string }> {
		const competitorId = cmd.competitorId as ProjectManagement.CompetitorId;
		const competitor = await this.competitors.findById(competitorId);
		if (!competitor) {
			throw new NotFoundError(`Competitor ${cmd.competitorId} not found`);
		}
		const id = this.ids.generate() as ProjectManagement.CompetitorActivityObservationId;
		const observation = ProjectManagement.CompetitorActivityObservation.recordWaybackSnapshot({
			id,
			projectId: competitor.projectId,
			competitorId,
			metrics: {
				snapshotCount: cmd.summary.snapshotCount,
				latestSnapshotAt: cmd.summary.latestSnapshotAt ? new Date(cmd.summary.latestSnapshotAt) : null,
				earliestSnapshotAt: cmd.summary.earliestSnapshotAt ? new Date(cmd.summary.earliestSnapshotAt) : null,
			},
			rawPayloadId: cmd.rawPayloadId,
			now: this.clock.now(),
		});
		await this.observations.save(observation);
		return { observationId: id };
	}
}
