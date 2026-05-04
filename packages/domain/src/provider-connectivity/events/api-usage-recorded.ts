import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { ApiUsageEntryId, ProviderCredentialId } from '../value-objects/identifiers.js';

export class ApiUsageRecorded implements DomainEvent {
	readonly type = 'ApiUsageRecorded';
	readonly usageId: ApiUsageEntryId;
	readonly organizationId: OrganizationId;
	readonly credentialId: ProviderCredentialId;
	readonly projectId: ProjectId | null;
	readonly providerId: string;
	readonly endpointId: string;
	readonly costCents: number;
	readonly occurredAt: Date;

	constructor(props: {
		usageId: ApiUsageEntryId;
		organizationId: OrganizationId;
		credentialId: ProviderCredentialId;
		projectId: ProjectId | null;
		providerId: string;
		endpointId: string;
		costCents: number;
		occurredAt: Date;
	}) {
		this.usageId = props.usageId;
		this.organizationId = props.organizationId;
		this.credentialId = props.credentialId;
		this.projectId = props.projectId;
		this.providerId = props.providerId;
		this.endpointId = props.endpointId;
		this.costCents = props.costCents;
		this.occurredAt = props.occurredAt;
	}
}
