import { ExperienceAnalytics, type SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface RecordExperienceSnapshotCommand {
	clarityProjectId: string;
	observedDate: string;
	sessionsCount: number;
	botSessionsCount: number;
	distinctUserCount: number;
	pagesPerSession: number;
	rageClicks: number;
	deadClicks: number;
	avgEngagementSeconds: number;
	avgScrollDepth: number;
	rawPayloadId: string | null;
}

export interface RecordExperienceSnapshotResult {
	inserted: boolean;
}

/**
 * Record a single Clarity daily-metrics snapshot. Returns `inserted` so the
 * worker only emits the `ExperienceSnapshotRecorded` event on first write —
 * idempotent re-fetches on the same `(project, observedDate)` are no-ops.
 */
export class RecordExperienceSnapshotUseCase {
	constructor(
		private readonly projects: ExperienceAnalytics.ClarityProjectRepository,
		private readonly snapshots: ExperienceAnalytics.ExperienceSnapshotRepository,
		private readonly events: SharedKernel.EventPublisher,
		private readonly clock: Clock,
	) {}

	async execute(cmd: RecordExperienceSnapshotCommand): Promise<RecordExperienceSnapshotResult> {
		const cp = await this.projects.findById(cmd.clarityProjectId as ExperienceAnalytics.ClarityProjectId);
		if (!cp) throw new NotFoundError(`ClarityProject ${cmd.clarityProjectId} not found`);
		if (!cp.isActive()) return { inserted: false };

		const snapshot = ExperienceAnalytics.ExperienceSnapshot.record({
			clarityProjectId: cp.id,
			projectId: cp.projectId,
			observedDate: cmd.observedDate,
			metrics: ExperienceAnalytics.ExperienceMetrics.create({
				sessionsCount: cmd.sessionsCount,
				botSessionsCount: cmd.botSessionsCount,
				distinctUserCount: cmd.distinctUserCount,
				pagesPerSession: cmd.pagesPerSession,
				rageClicks: cmd.rageClicks,
				deadClicks: cmd.deadClicks,
				avgEngagementSeconds: cmd.avgEngagementSeconds,
				avgScrollDepth: cmd.avgScrollDepth,
			}),
			rawPayloadId: cmd.rawPayloadId,
		});

		const { inserted } = await this.snapshots.save(snapshot);
		if (inserted) {
			await this.events.publish([
				new ExperienceAnalytics.ExperienceSnapshotRecorded({
					clarityProjectId: cp.id,
					projectId: cp.projectId,
					observedDate: cmd.observedDate,
					sessionsCount: cmd.sessionsCount,
					rageClicks: cmd.rageClicks,
					occurredAt: this.clock.now(),
				}),
			]);
		}
		return { inserted };
	}
}
