import { MacroContext, type SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface RecordRadarRankCommand {
	monitoredDomainId: string;
	observedDate: string;
	rank: number | null;
	bucket: string | null;
	categories: Record<string, number>;
	rawPayloadId: string | null;
}

export interface RecordRadarRankResult {
	inserted: boolean;
}

/**
 * Persist a single Cloudflare Radar rank snapshot for a monitored domain.
 * Mirrors the PageSpeed `record` shape (one snapshot per call) — the
 * monthly cron schedules one job per monitored domain.
 *
 * Returns `inserted` so the caller (worker) only emits the
 * `RadarRankRecorded` event on the first write, never on idempotent
 * re-fetches of the same `(domain, observedDate)` pair.
 */
export class RecordRadarRankUseCase {
	constructor(
		private readonly domains: MacroContext.MonitoredDomainRepository,
		private readonly snapshots: MacroContext.RadarRankSnapshotRepository,
		private readonly events: SharedKernel.EventPublisher,
		private readonly clock: Clock,
	) {}

	async execute(cmd: RecordRadarRankCommand): Promise<RecordRadarRankResult> {
		const md = await this.domains.findById(cmd.monitoredDomainId as MacroContext.MonitoredDomainId);
		if (!md) throw new NotFoundError(`MonitoredDomain ${cmd.monitoredDomainId} not found`);
		if (!md.isActive()) return { inserted: false };

		const snapshot = MacroContext.RadarRankSnapshot.record({
			monitoredDomainId: md.id,
			projectId: md.projectId,
			observedDate: cmd.observedDate,
			rank: MacroContext.RadarRank.create({
				rank: cmd.rank,
				bucket: cmd.bucket,
				categories: cmd.categories,
			}),
			rawPayloadId: cmd.rawPayloadId,
		});

		const { inserted } = await this.snapshots.save(snapshot);
		if (inserted) {
			await this.events.publish([
				new MacroContext.RadarRankRecorded({
					monitoredDomainId: md.id,
					projectId: md.projectId,
					observedDate: cmd.observedDate,
					rank: cmd.rank,
					occurredAt: this.clock.now(),
				}),
			]);
		}
		return { inserted };
	}
}
