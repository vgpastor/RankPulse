import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { MembershipId, OrganizationId, UserId } from '../value-objects/identifiers.js';

export class MembershipRevoked implements DomainEvent {
	readonly type = 'identity-access.MembershipRevoked';
	readonly occurredAt: Date;
	readonly membershipId: MembershipId;
	readonly organizationId: OrganizationId;
	readonly userId: UserId;

	constructor(input: {
		membershipId: MembershipId;
		organizationId: OrganizationId;
		userId: UserId;
		occurredAt: Date;
	}) {
		this.membershipId = input.membershipId;
		this.organizationId = input.organizationId;
		this.userId = input.userId;
		this.occurredAt = input.occurredAt;
	}
}
