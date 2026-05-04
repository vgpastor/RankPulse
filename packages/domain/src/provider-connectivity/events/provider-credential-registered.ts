import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { ProviderCredentialId } from '../value-objects/identifiers.js';

export class ProviderCredentialRegistered implements DomainEvent {
	readonly type = 'ProviderCredentialRegistered';
	readonly credentialId: ProviderCredentialId;
	readonly organizationId: OrganizationId;
	readonly providerId: string;
	readonly scope: { type: string; id: string };
	readonly occurredAt: Date;

	constructor(props: {
		credentialId: ProviderCredentialId;
		organizationId: OrganizationId;
		providerId: string;
		scope: { type: string; id: string };
		occurredAt: Date;
	}) {
		this.credentialId = props.credentialId;
		this.organizationId = props.organizationId;
		this.providerId = props.providerId;
		this.scope = props.scope;
		this.occurredAt = props.occurredAt;
	}
}
