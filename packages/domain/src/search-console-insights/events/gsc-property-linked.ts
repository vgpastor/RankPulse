import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { GscPropertyId } from '../value-objects/identifiers.js';
import type { GscPropertyType } from '../value-objects/property-type.js';

export class GscPropertyLinked implements DomainEvent {
	readonly type = 'GscPropertyLinked';
	readonly gscPropertyId: GscPropertyId;
	readonly projectId: ProjectId;
	readonly organizationId: OrganizationId;
	readonly siteUrl: string;
	readonly propertyType: GscPropertyType;
	readonly occurredAt: Date;

	constructor(props: {
		gscPropertyId: GscPropertyId;
		projectId: ProjectId;
		organizationId: OrganizationId;
		siteUrl: string;
		propertyType: GscPropertyType;
		occurredAt: Date;
	}) {
		this.gscPropertyId = props.gscPropertyId;
		this.projectId = props.projectId;
		this.organizationId = props.organizationId;
		this.siteUrl = props.siteUrl;
		this.propertyType = props.propertyType;
		this.occurredAt = props.occurredAt;
	}
}
