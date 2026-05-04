import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { OrganizationId, UserId } from '../value-objects/identifiers.js';
import type { Role } from '../value-objects/role.js';

export class UserInvited implements DomainEvent {
	readonly type = 'identity-access.UserInvited';
	readonly occurredAt: Date;
	readonly organizationId: OrganizationId;
	readonly userId: UserId;
	readonly role: Role;
	readonly invitedBy: UserId;

	constructor(input: {
		organizationId: OrganizationId;
		userId: UserId;
		role: Role;
		invitedBy: UserId;
		occurredAt: Date;
	}) {
		this.organizationId = input.organizationId;
		this.userId = input.userId;
		this.role = input.role;
		this.invitedBy = input.invitedBy;
		this.occurredAt = input.occurredAt;
	}
}
