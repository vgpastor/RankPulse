import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { ExperienceMetrics } from '../value-objects/experience-metrics.js';
import type { ClarityProjectId } from '../value-objects/identifiers.js';

export interface ExperienceSnapshotProps {
	clarityProjectId: ClarityProjectId;
	projectId: ProjectId;
	observedDate: string; // YYYY-MM-DD
	metrics: ExperienceMetrics;
	rawPayloadId: string | null;
}

/**
 * One immutable Microsoft Clarity daily metrics snapshot at calendar-day
 * granularity. Value-like factory; the record use case publishes one
 * summary event per call (mirrors the GSC / GA4 / Bing batch shape).
 */
export class ExperienceSnapshot extends AggregateRoot {
	private constructor(private readonly props: ExperienceSnapshotProps) {
		super();
	}

	static record(input: ExperienceSnapshotProps): ExperienceSnapshot {
		return new ExperienceSnapshot(input);
	}

	static rehydrate(props: ExperienceSnapshotProps): ExperienceSnapshot {
		return new ExperienceSnapshot(props);
	}

	get clarityProjectId(): ClarityProjectId {
		return this.props.clarityProjectId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get observedDate(): string {
		return this.props.observedDate;
	}
	get metrics(): ExperienceMetrics {
		return this.props.metrics;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
}
