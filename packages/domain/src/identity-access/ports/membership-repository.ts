import type { Membership } from '../entities/membership.js';
import type { MembershipId, OrganizationId, UserId } from '../value-objects/identifiers.js';

export interface MembershipRepository {
	save(membership: Membership): Promise<void>;
	findById(id: MembershipId): Promise<Membership | null>;
	findActiveFor(orgId: OrganizationId, userId: UserId): Promise<Membership | null>;
	listForOrganization(orgId: OrganizationId): Promise<readonly Membership[]>;
	listForUser(userId: UserId): Promise<readonly Membership[]>;
}
