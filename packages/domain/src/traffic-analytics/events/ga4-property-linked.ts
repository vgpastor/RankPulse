import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { Ga4PropertyId } from '../value-objects/identifiers.js';

export class Ga4PropertyLinked implements DomainEvent {
	readonly type = 'Ga4PropertyLinked';
	readonly ga4PropertyId: Ga4PropertyId;
	readonly projectId: ProjectId;
	readonly organizationId: OrganizationId;
	readonly propertyHandle: string;
	readonly occurredAt: Date;

	constructor(props: {
		ga4PropertyId: Ga4PropertyId;
		projectId: ProjectId;
		organizationId: OrganizationId;
		propertyHandle: string;
		occurredAt: Date;
	}) {
		this.ga4PropertyId = props.ga4PropertyId;
		this.projectId = props.projectId;
		this.organizationId = props.organizationId;
		this.propertyHandle = props.propertyHandle;
		this.occurredAt = props.occurredAt;
	}
}
