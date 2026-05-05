import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { GscPropertyId } from '../value-objects/identifiers.js';

/**
 * One event per ingest call (NOT per row). The previous design emitted
 * one `GscPerformanceIngested` per observation, fanning out 25k events
 * for a single GSC fetch with the default rowLimit. Subscribers were
 * already aggregating totals downstream, so we publish the summary
 * directly and let raw rows live in the read model only.
 */
export class GscPerformanceBatchIngested implements DomainEvent {
	readonly type = 'GscPerformanceBatchIngested';
	readonly projectId: ProjectId;
	readonly gscPropertyId: GscPropertyId;
	readonly rowsCount: number;
	readonly totalClicks: number;
	readonly totalImpressions: number;
	readonly occurredAt: Date;

	constructor(props: {
		projectId: ProjectId;
		gscPropertyId: GscPropertyId;
		rowsCount: number;
		totalClicks: number;
		totalImpressions: number;
		occurredAt: Date;
	}) {
		this.projectId = props.projectId;
		this.gscPropertyId = props.gscPropertyId;
		this.rowsCount = props.rowsCount;
		this.totalClicks = props.totalClicks;
		this.totalImpressions = props.totalImpressions;
		this.occurredAt = props.occurredAt;
	}
}
