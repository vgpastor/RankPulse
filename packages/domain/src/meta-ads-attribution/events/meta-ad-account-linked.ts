import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { MetaAdAccountId } from '../value-objects/identifiers.js';

export class MetaAdAccountLinked implements DomainEvent {
	readonly type = 'MetaAdAccountLinked';
	readonly metaAdAccountId: MetaAdAccountId;
	readonly projectId: ProjectId;
	readonly organizationId: OrganizationId;
	readonly adAccountHandle: string;
	readonly occurredAt: Date;

	constructor(props: {
		metaAdAccountId: MetaAdAccountId;
		projectId: ProjectId;
		organizationId: OrganizationId;
		adAccountHandle: string;
		occurredAt: Date;
	}) {
		this.metaAdAccountId = props.metaAdAccountId;
		this.projectId = props.projectId;
		this.organizationId = props.organizationId;
		this.adAccountHandle = props.adAccountHandle;
		this.occurredAt = props.occurredAt;
	}
}
