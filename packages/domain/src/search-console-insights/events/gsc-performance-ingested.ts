import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { GscObservationId, GscPropertyId } from '../value-objects/identifiers.js';

export class GscPerformanceIngested implements DomainEvent {
	readonly type = 'GscPerformanceIngested';
	readonly observationId: GscObservationId;
	readonly projectId: ProjectId;
	readonly gscPropertyId: GscPropertyId;
	readonly clicks: number;
	readonly impressions: number;
	readonly occurredAt: Date;

	constructor(props: {
		observationId: GscObservationId;
		projectId: ProjectId;
		gscPropertyId: GscPropertyId;
		clicks: number;
		impressions: number;
		occurredAt: Date;
	}) {
		this.observationId = props.observationId;
		this.projectId = props.projectId;
		this.gscPropertyId = props.gscPropertyId;
		this.clicks = props.clicks;
		this.impressions = props.impressions;
		this.occurredAt = props.occurredAt;
	}
}
