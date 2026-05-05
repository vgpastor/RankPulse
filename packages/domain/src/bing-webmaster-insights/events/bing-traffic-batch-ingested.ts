import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { BingPropertyId } from '../value-objects/identifiers.js';

/**
 * Mirrors GscPerformanceBatchIngested / Ga4BatchIngested — one summary
 * event per ingest call, never per row, so a 6-month back-fetch doesn't
 * fan-out hundreds of events.
 */
export class BingTrafficBatchIngested implements DomainEvent {
	readonly type = 'BingTrafficBatchIngested';
	readonly projectId: ProjectId;
	readonly bingPropertyId: BingPropertyId;
	readonly rowsCount: number;
	readonly totalClicks: number;
	readonly totalImpressions: number;
	readonly occurredAt: Date;

	constructor(props: {
		projectId: ProjectId;
		bingPropertyId: BingPropertyId;
		rowsCount: number;
		totalClicks: number;
		totalImpressions: number;
		occurredAt: Date;
	}) {
		this.projectId = props.projectId;
		this.bingPropertyId = props.bingPropertyId;
		this.rowsCount = props.rowsCount;
		this.totalClicks = props.totalClicks;
		this.totalImpressions = props.totalImpressions;
		this.occurredAt = props.occurredAt;
	}
}
