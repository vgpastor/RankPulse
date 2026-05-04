import { IdentityAccess } from '@rankpulse/domain';
import { Uuid } from '@rankpulse/shared';

export const anEmail = (s = 'owner@example.com') => IdentityAccess.Email.create(s);
export const aPasswordHash = () =>
	IdentityAccess.PasswordHash.fromHashed(`fake$${'0'.repeat(16)}$test-password-12`);

export const anOrganization = (
	overrides: Partial<{
		id: IdentityAccess.OrganizationId;
		name: string;
		slug: string;
		ownerId: IdentityAccess.UserId;
		now: Date;
	}> = {},
) =>
	IdentityAccess.Organization.register({
		id: overrides.id ?? (Uuid.generate() as IdentityAccess.OrganizationId),
		name: overrides.name ?? 'Acme',
		slug: overrides.slug ?? 'acme',
		ownerId: overrides.ownerId ?? (Uuid.generate() as IdentityAccess.UserId),
		now: overrides.now ?? new Date('2026-05-04T10:00:00Z'),
	});

export const aUser = (
	overrides: Partial<{
		id: IdentityAccess.UserId;
		email: IdentityAccess.Email;
		name: string;
		passwordHash: IdentityAccess.PasswordHash;
		now: Date;
	}> = {},
) =>
	IdentityAccess.User.register({
		id: overrides.id ?? (Uuid.generate() as IdentityAccess.UserId),
		email: overrides.email ?? anEmail(),
		name: overrides.name ?? 'Owner User',
		passwordHash: overrides.passwordHash ?? aPasswordHash(),
		now: overrides.now ?? new Date('2026-05-04T10:00:00Z'),
	});

export const aMembership = (
	overrides: Partial<{
		id: IdentityAccess.MembershipId;
		organizationId: IdentityAccess.OrganizationId;
		userId: IdentityAccess.UserId;
		role: IdentityAccess.Role;
		now: Date;
	}> = {},
) =>
	IdentityAccess.Membership.grant({
		id: overrides.id ?? (Uuid.generate() as IdentityAccess.MembershipId),
		organizationId: overrides.organizationId ?? (Uuid.generate() as IdentityAccess.OrganizationId),
		userId: overrides.userId ?? (Uuid.generate() as IdentityAccess.UserId),
		role: overrides.role ?? IdentityAccess.Roles.OWNER,
		now: overrides.now ?? new Date('2026-05-04T10:00:00Z'),
	});
