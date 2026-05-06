import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { MetaPixelId } from '../value-objects/identifiers.js';

export class MetaPixelLinked implements DomainEvent {
	readonly type = 'MetaPixelLinked';
	readonly metaPixelId: MetaPixelId;
	readonly projectId: ProjectId;
	readonly organizationId: OrganizationId;
	readonly pixelHandle: string;
	readonly occurredAt: Date;

	constructor(props: {
		metaPixelId: MetaPixelId;
		projectId: ProjectId;
		organizationId: OrganizationId;
		pixelHandle: string;
		occurredAt: Date;
	}) {
		this.metaPixelId = props.metaPixelId;
		this.projectId = props.projectId;
		this.organizationId = props.organizationId;
		this.pixelHandle = props.pixelHandle;
		this.occurredAt = props.occurredAt;
	}
}
