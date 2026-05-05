import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { TrackedPageId } from '../value-objects/identifiers.js';

/**
 * One event per ingested snapshot. Snapshots are atomic (1 PSI run =
 * 1 row), so per-row events are fine here — unlike GSC ingestion
 * which fans out 25k rows.
 */
export class PageSpeedSnapshotRecorded implements DomainEvent {
	readonly type = 'PageSpeedSnapshotRecorded';
	readonly trackedPageId: TrackedPageId;
	readonly projectId: ProjectId;
	readonly performanceScore: number | null;
	readonly lcpMs: number | null;
	readonly inpMs: number | null;
	readonly cls: number | null;
	readonly occurredAt: Date;

	constructor(props: {
		trackedPageId: TrackedPageId;
		projectId: ProjectId;
		performanceScore: number | null;
		lcpMs: number | null;
		inpMs: number | null;
		cls: number | null;
		occurredAt: Date;
	}) {
		this.trackedPageId = props.trackedPageId;
		this.projectId = props.projectId;
		this.performanceScore = props.performanceScore;
		this.lcpMs = props.lcpMs;
		this.inpMs = props.inpMs;
		this.cls = props.cls;
		this.occurredAt = props.occurredAt;
	}
}
