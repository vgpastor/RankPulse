import { IdentityAccess, type SharedKernel } from '@rankpulse/domain';
import {
	type Clock,
	ConflictError,
	ForbiddenError,
	type IdGenerator,
	NotFoundError,
} from '@rankpulse/shared';

export interface InviteUserCommand {
	organizationId: string;
	invitedByUserId: string;
	invitee: {
		email: string;
		name: string;
		passwordHash: string;
	};
	role: IdentityAccess.Role;
}

export interface InviteUserResult {
	userId: string;
	membershipId: string;
}

/**
 * Adds a user to an organization with the given role. The actual onboarding
 * email is dispatched by an event handler in infrastructure.
 *
 * For v1 the use case accepts a pre-hashed password (e.g. from a token-based
 * invitation flow). The hashing is the responsibility of the invitation flow
 * outside this aggregate.
 */
export class InviteUserUseCase {
	constructor(
		private readonly memberships: IdentityAccess.MembershipRepository,
		private readonly users: IdentityAccess.UserRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: InviteUserCommand): Promise<InviteUserResult> {
		const orgId = cmd.organizationId as IdentityAccess.OrganizationId;
		const inviter = await this.memberships.findActiveFor(orgId, cmd.invitedByUserId as IdentityAccess.UserId);
		if (!inviter) {
			throw new NotFoundError('Inviter has no active membership in this organization');
		}
		if (!IdentityAccess.isAtLeast(inviter.role, IdentityAccess.Roles.ADMIN)) {
			throw new ForbiddenError('Admin role required to invite users');
		}

		const email = IdentityAccess.Email.create(cmd.invitee.email);
		const existing = await this.users.findByEmail(email);

		const now = this.clock.now();
		const userId = existing?.id ?? (this.ids.generate() as IdentityAccess.UserId);

		if (!existing) {
			const passwordHash = IdentityAccess.PasswordHash.fromHashed(cmd.invitee.passwordHash);
			const user = IdentityAccess.User.register({
				id: userId,
				email,
				name: cmd.invitee.name,
				passwordHash,
				now,
			});
			await this.users.save(user);
		}

		const alreadyMember = await this.memberships.findActiveFor(orgId, userId);
		if (alreadyMember) {
			throw new ConflictError('User is already a member of this organization');
		}

		const membershipId = this.ids.generate() as IdentityAccess.MembershipId;
		const membership = IdentityAccess.Membership.grant({
			id: membershipId,
			organizationId: orgId,
			userId,
			role: cmd.role,
			now,
		});
		await this.memberships.save(membership);

		const invitedEvent = new IdentityAccess.UserInvited({
			organizationId: orgId,
			userId,
			role: cmd.role,
			invitedBy: cmd.invitedByUserId as IdentityAccess.UserId,
			occurredAt: now,
		});
		await this.events.publish([invitedEvent, ...membership.pullEvents()]);

		return { userId, membershipId };
	}
}
