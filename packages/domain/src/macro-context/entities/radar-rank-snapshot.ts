import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { MonitoredDomainId } from '../value-objects/identifiers.js';
import type { RadarRank } from '../value-objects/radar-rank.js';

export interface RadarRankSnapshotProps {
	monitoredDomainId: MonitoredDomainId;
	projectId: ProjectId;
	observedDate: string; // YYYY-MM-DD
	rank: RadarRank;
	rawPayloadId: string | null;
}

/**
 * One immutable Cloudflare Radar rank snapshot at calendar-day granularity.
 * Value-like factory; the record use case publishes one summary event per
 * call, never per row (we typically write 1-N rows per fetch — one per
 * monitored domain).
 */
export class RadarRankSnapshot extends AggregateRoot {
	private constructor(private readonly props: RadarRankSnapshotProps) {
		super();
	}

	static record(input: RadarRankSnapshotProps): RadarRankSnapshot {
		return new RadarRankSnapshot(input);
	}

	static rehydrate(props: RadarRankSnapshotProps): RadarRankSnapshot {
		return new RadarRankSnapshot(props);
	}

	get monitoredDomainId(): MonitoredDomainId {
		return this.props.monitoredDomainId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get observedDate(): string {
		return this.props.observedDate;
	}
	get rank(): RadarRank {
		return this.props.rank;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
}
