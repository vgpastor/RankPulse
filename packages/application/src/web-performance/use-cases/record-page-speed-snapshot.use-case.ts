import { type SharedKernel, WebPerformance } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface RecordPageSpeedSnapshotCommand {
	trackedPageId: string;
	observedAt: Date;
	lcpMs: number | null;
	inpMs: number | null;
	cls: number | null;
	fcpMs: number | null;
	ttfbMs: number | null;
	performanceScore: number | null;
	seoScore: number | null;
	accessibilityScore: number | null;
	bestPracticesScore: number | null;
}

export interface RecordPageSpeedSnapshotResult {
	inserted: boolean;
}

/**
 * Worker entry point: persists a single PSI snapshot for an existing
 * tracked page. Idempotent on (trackedPageId, observedAt) — the repo's
 * `onConflictDoNothing` returns `inserted: false` for collisions and we
 * skip the domain event so subscribers don't see retries as fresh
 * data.
 */
export class RecordPageSpeedSnapshotUseCase {
	constructor(
		private readonly trackedPages: WebPerformance.TrackedPageRepository,
		private readonly snapshots: WebPerformance.PageSpeedSnapshotRepository,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: RecordPageSpeedSnapshotCommand): Promise<RecordPageSpeedSnapshotResult> {
		const page = await this.trackedPages.findById(cmd.trackedPageId as WebPerformance.TrackedPageId);
		if (!page) throw new NotFoundError(`Tracked page ${cmd.trackedPageId} not found`);

		const snapshot = WebPerformance.PageSpeedSnapshot.record({
			trackedPageId: page.id,
			projectId: page.projectId,
			observedAt: cmd.observedAt,
			lcpMs: cmd.lcpMs,
			inpMs: cmd.inpMs,
			cls: cmd.cls,
			fcpMs: cmd.fcpMs,
			ttfbMs: cmd.ttfbMs,
			performanceScore: cmd.performanceScore,
			seoScore: cmd.seoScore,
			accessibilityScore: cmd.accessibilityScore,
			bestPracticesScore: cmd.bestPracticesScore,
		});

		const { inserted } = await this.snapshots.save(snapshot);

		if (inserted) {
			await this.events.publish([
				new WebPerformance.PageSpeedSnapshotRecorded({
					trackedPageId: page.id,
					projectId: page.projectId,
					performanceScore: snapshot.performanceScore,
					lcpMs: snapshot.lcpMs,
					inpMs: snapshot.inpMs,
					cls: snapshot.cls,
					occurredAt: snapshot.observedAt,
				}),
			]);
		}

		return { inserted };
	}
}
