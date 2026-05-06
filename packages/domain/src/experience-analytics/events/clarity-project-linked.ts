import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { ClarityProjectId } from '../value-objects/identifiers.js';

export class ClarityProjectLinked implements DomainEvent {
	readonly type = 'ClarityProjectLinked';
	readonly clarityProjectId: ClarityProjectId;
	readonly projectId: ProjectId;
	readonly organizationId: OrganizationId;
	readonly clarityHandle: string;
	readonly occurredAt: Date;

	constructor(props: {
		clarityProjectId: ClarityProjectId;
		projectId: ProjectId;
		organizationId: OrganizationId;
		clarityHandle: string;
		occurredAt: Date;
	}) {
		this.clarityProjectId = props.clarityProjectId;
		this.projectId = props.projectId;
		this.organizationId = props.organizationId;
		this.clarityHandle = props.clarityHandle;
		this.occurredAt = props.occurredAt;
	}
}
