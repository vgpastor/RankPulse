import type { IdentityAccess } from '@rankpulse/domain';
import { IdentityAccess as IAUtils } from '@rankpulse/domain';
import { ForbiddenError } from '@rankpulse/shared';
import type { AuthPrincipal } from './jwt.service.js';

/**
 * Authorization helper used by every controller that operates inside an
 * organization. Centralizes the membership lookup so the rule
 *  "the principal must be an active member of the resource's organization"
 * lives in exactly one place.
 *
 * Returns the matched membership so the caller can also enforce role-based
 * checks (e.g. require ADMIN for credential management).
 */
export class OrgMembership {
	constructor(private readonly memberships: IdentityAccess.MembershipRepository) {}

	async require(principal: AuthPrincipal, organizationId: string): Promise<IdentityAccess.Membership> {
		const m = await this.memberships.findActiveFor(
			organizationId as IdentityAccess.OrganizationId,
			principal.userId as IdentityAccess.UserId,
		);
		if (!m) {
			throw new ForbiddenError('Not a member of this organization');
		}
		return m;
	}

	async requireAdmin(principal: AuthPrincipal, organizationId: string): Promise<IdentityAccess.Membership> {
		const m = await this.require(principal, organizationId);
		if (!IAUtils.isAtLeast(m.role, IAUtils.Roles.ADMIN)) {
			throw new ForbiddenError('Admin role required');
		}
		return m;
	}
}
