import { IdentityAccess, type SharedKernel } from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator, InvalidInputError } from '@rankpulse/shared';

export interface RegisterOrganizationCommand {
	organizationName: string;
	slug: string;
	owner: {
		email: string;
		name: string;
		password: string;
	};
}

export interface RegisterOrganizationResult {
	organizationId: string;
	ownerUserId: string;
	membershipId: string;
}

/**
 * Creates an organization, registers its owner user and an OWNER membership in
 * one consistent action. Publishes domain events on success.
 *
 * Mocks at port boundary only: repositories, clock, id generator, password hasher,
 * event publisher.
 */
export class RegisterOrganizationUseCase {
	constructor(
		private readonly organizations: IdentityAccess.OrganizationRepository,
		private readonly users: IdentityAccess.UserRepository,
		private readonly memberships: IdentityAccess.MembershipRepository,
		private readonly passwordHasher: IdentityAccess.PasswordHasher,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: RegisterOrganizationCommand): Promise<RegisterOrganizationResult> {
		if (cmd.owner.password.length < 12) {
			throw new InvalidInputError('Password must be at least 12 characters');
		}

		const email = IdentityAccess.Email.create(cmd.owner.email);

		const existingOrg = await this.organizations.findBySlug(cmd.slug.trim().toLowerCase());
		if (existingOrg) {
			throw new ConflictError(`Organization slug "${cmd.slug}" already in use`);
		}
		const existingUser = await this.users.findByEmail(email);
		if (existingUser) {
			throw new ConflictError(`Email "${email.value}" already registered`);
		}

		const now = this.clock.now();
		const userId = this.ids.generate() as IdentityAccess.UserId;
		const orgId = this.ids.generate() as IdentityAccess.OrganizationId;
		const membershipId = this.ids.generate() as IdentityAccess.MembershipId;

		const passwordHash = await this.passwordHasher.hash(cmd.owner.password);

		const user = IdentityAccess.User.register({
			id: userId,
			email,
			name: cmd.owner.name,
			passwordHash,
			now,
		});

		const org = IdentityAccess.Organization.register({
			id: orgId,
			name: cmd.organizationName,
			slug: cmd.slug,
			ownerId: userId,
			now,
		});

		const membership = IdentityAccess.Membership.grant({
			id: membershipId,
			organizationId: orgId,
			userId,
			role: IdentityAccess.Roles.OWNER,
			now,
		});

		await this.users.save(user);
		await this.organizations.save(org);
		await this.memberships.save(membership);

		await this.events.publish([...org.pullEvents(), ...user.pullEvents(), ...membership.pullEvents()]);

		return { organizationId: orgId, ownerUserId: userId, membershipId };
	}
}
