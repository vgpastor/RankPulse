import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { ProviderCredentialId } from '../value-objects/identifiers.js';

export class ProviderCredentialRevoked implements DomainEvent {
	readonly type = 'ProviderCredentialRevoked';
	readonly credentialId: ProviderCredentialId;
	readonly organizationId: OrganizationId;
	readonly providerId: string;
	readonly occurredAt: Date;

	constructor(props: {
		credentialId: ProviderCredentialId;
		organizationId: OrganizationId;
		providerId: string;
		occurredAt: Date;
	}) {
		this.credentialId = props.credentialId;
		this.organizationId = props.organizationId;
		this.providerId = props.providerId;
		this.occurredAt = props.occurredAt;
	}
}
