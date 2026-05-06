import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { MonitoredDomainId } from '../value-objects/identifiers.js';

export class MonitoredDomainAdded implements DomainEvent {
	readonly type = 'MonitoredDomainAdded';
	readonly monitoredDomainId: MonitoredDomainId;
	readonly projectId: ProjectId;
	readonly organizationId: OrganizationId;
	readonly domain: string;
	readonly occurredAt: Date;

	constructor(props: {
		monitoredDomainId: MonitoredDomainId;
		projectId: ProjectId;
		organizationId: OrganizationId;
		domain: string;
		occurredAt: Date;
	}) {
		this.monitoredDomainId = props.monitoredDomainId;
		this.projectId = props.projectId;
		this.organizationId = props.organizationId;
		this.domain = props.domain;
		this.occurredAt = props.occurredAt;
	}
}
