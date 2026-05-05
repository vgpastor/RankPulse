import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { BingPropertyId } from '../value-objects/identifiers.js';

export class BingPropertyLinked implements DomainEvent {
	readonly type = 'BingPropertyLinked';
	readonly bingPropertyId: BingPropertyId;
	readonly projectId: ProjectId;
	readonly organizationId: OrganizationId;
	readonly siteUrl: string;
	readonly occurredAt: Date;

	constructor(props: {
		bingPropertyId: BingPropertyId;
		projectId: ProjectId;
		organizationId: OrganizationId;
		siteUrl: string;
		occurredAt: Date;
	}) {
		this.bingPropertyId = props.bingPropertyId;
		this.projectId = props.projectId;
		this.organizationId = props.organizationId;
		this.siteUrl = props.siteUrl;
		this.occurredAt = props.occurredAt;
	}
}
