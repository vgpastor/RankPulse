import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { MonitoredDomainId } from '../value-objects/identifiers.js';

export class RadarRankRecorded implements DomainEvent {
	readonly type = 'RadarRankRecorded';
	readonly monitoredDomainId: MonitoredDomainId;
	readonly projectId: ProjectId;
	readonly observedDate: string;
	readonly rank: number | null;
	readonly occurredAt: Date;

	constructor(props: {
		monitoredDomainId: MonitoredDomainId;
		projectId: ProjectId;
		observedDate: string;
		rank: number | null;
		occurredAt: Date;
	}) {
		this.monitoredDomainId = props.monitoredDomainId;
		this.projectId = props.projectId;
		this.observedDate = props.observedDate;
		this.rank = props.rank;
		this.occurredAt = props.occurredAt;
	}
}
