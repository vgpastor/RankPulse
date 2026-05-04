import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { OrganizationId, UserId } from '../value-objects/identifiers.js';

export class OrganizationCreated implements DomainEvent {
	readonly type = 'identity-access.OrganizationCreated';
	readonly occurredAt: Date;
	readonly organizationId: OrganizationId;
	readonly ownerId: UserId;
	readonly slug: string;

	constructor(input: {
		organizationId: OrganizationId;
		ownerId: UserId;
		slug: string;
		occurredAt: Date;
	}) {
		this.organizationId = input.organizationId;
		this.ownerId = input.ownerId;
		this.slug = input.slug;
		this.occurredAt = input.occurredAt;
	}
}
