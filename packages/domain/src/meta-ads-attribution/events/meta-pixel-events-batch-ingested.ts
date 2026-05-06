import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { MetaPixelId } from '../value-objects/identifiers.js';

/**
 * One event per ingest call, never per row. Mirrors the GA4/GSC pattern:
 * if a 30-day backfill returns 600 rows we publish one summary, not 600.
 */
export class MetaPixelEventsBatchIngested implements DomainEvent {
	readonly type = 'MetaPixelEventsBatchIngested';
	readonly projectId: ProjectId;
	readonly metaPixelId: MetaPixelId;
	readonly rowsCount: number;
	readonly totalEvents: number;
	readonly totalValueSum: number;
	readonly occurredAt: Date;

	constructor(props: {
		projectId: ProjectId;
		metaPixelId: MetaPixelId;
		rowsCount: number;
		totalEvents: number;
		totalValueSum: number;
		occurredAt: Date;
	}) {
		this.projectId = props.projectId;
		this.metaPixelId = props.metaPixelId;
		this.rowsCount = props.rowsCount;
		this.totalEvents = props.totalEvents;
		this.totalValueSum = props.totalValueSum;
		this.occurredAt = props.occurredAt;
	}
}
