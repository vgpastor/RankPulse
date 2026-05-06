import { IdentityAccess } from '@rankpulse/domain';
import {
	ConflictError,
	FakeClock,
	FixedIdGenerator,
	ForbiddenError,
	NotFoundError,
	type Uuid,
} from '@rankpulse/shared';
import {
	anEmail,
	aPasswordHash,
	InMemoryMembershipRepository,
	InMemoryUserRepository,
	RecordingEventPublisher,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { InviteUserUseCase } from './invite-user.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const ADMIN_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as IdentityAccess.UserId;
const VIEWER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as IdentityAccess.UserId;

// 16+ chars so it satisfies PasswordHash.fromHashed.
const HASHED_PASSWORD = 'argon2$test$1234567890abcdef';

describe('InviteUserUseCase', () => {
	let users: InMemoryUserRepository;
	let memberships: InMemoryMembershipRepository;
	let events: RecordingEventPublisher;
	let clock: FakeClock;

	const buildUseCase = (ids: readonly Uuid[]) =>
		new InviteUserUseCase(memberships, users, clock, new FixedIdGenerator(ids), events);

	const seedAdminMembership = async () => {
		await memberships.save(
			IdentityAccess.Membership.grant({
				id: 'mem-admin' as Uuid as IdentityAccess.MembershipId,
				organizationId: ORG_ID,
				userId: ADMIN_USER_ID,
				role: IdentityAccess.Roles.ADMIN,
				now: clock.now(),
			}),
		);
	};

	const seedViewerMembership = async () => {
		await memberships.save(
			IdentityAccess.Membership.grant({
				id: 'mem-viewer' as Uuid as IdentityAccess.MembershipId,
				organizationId: ORG_ID,
				userId: VIEWER_USER_ID,
				role: IdentityAccess.Roles.VIEWER,
				now: clock.now(),
			}),
		);
	};

	beforeEach(() => {
		users = new InMemoryUserRepository();
		memberships = new InMemoryMembershipRepository();
		events = new RecordingEventPublisher();
		clock = new FakeClock('2026-05-04T10:00:00Z');
	});

	it('creates a new user, grants membership and publishes UserInvited', async () => {
		await seedAdminMembership();
		const useCase = buildUseCase([
			'invitee-1' as Uuid, // userId
			'mem-1' as Uuid, // membershipId
		]);

		const result = await useCase.execute({
			organizationId: ORG_ID,
			invitedByUserId: ADMIN_USER_ID,
			invitee: {
				email: 'new-user@example.com',
				name: 'New User',
				passwordHash: HASHED_PASSWORD,
			},
			role: IdentityAccess.Roles.MEMBER,
		});

		expect(result.userId).toBe('invitee-1');
		expect(result.membershipId).toBe('mem-1');

		const newUser = await users.findByEmail(anEmail('new-user@example.com'));
		expect(newUser?.name).toBe('New User');

		const membership = await memberships.findActiveFor(ORG_ID, 'invitee-1' as Uuid as IdentityAccess.UserId);
		expect(membership?.role).toBe(IdentityAccess.Roles.MEMBER);

		expect(events.publishedTypes()).toContain('identity-access.UserInvited');
	});

	it('reuses an existing user when the email is already registered', async () => {
		await seedAdminMembership();
		await users.save(
			IdentityAccess.User.register({
				id: 'existing-user' as Uuid as IdentityAccess.UserId,
				email: anEmail('existing@example.com'),
				name: 'Existing User',
				passwordHash: aPasswordHash(),
				now: clock.now(),
			}),
		);
		const useCase = buildUseCase([
			'unused-1' as Uuid, // not consumed because the user already exists
			'mem-1' as Uuid,
		]);

		const result = await useCase.execute({
			organizationId: ORG_ID,
			invitedByUserId: ADMIN_USER_ID,
			invitee: {
				email: 'existing@example.com',
				name: 'Existing User',
				passwordHash: HASHED_PASSWORD,
			},
			role: IdentityAccess.Roles.MEMBER,
		});

		expect(result.userId).toBe('existing-user');
		expect(users.size()).toBe(1); // no new user row written
	});

	it('throws NotFoundError when the inviter has no active membership in the organization', async () => {
		const useCase = buildUseCase(['invitee-1' as Uuid, 'mem-1' as Uuid]);

		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				invitedByUserId: ADMIN_USER_ID, // no membership seeded
				invitee: {
					email: 'new-user@example.com',
					name: 'New User',
					passwordHash: HASHED_PASSWORD,
				},
				role: IdentityAccess.Roles.MEMBER,
			}),
		).rejects.toBeInstanceOf(NotFoundError);

		expect(users.size()).toBe(0);
		expect(memberships.size()).toBe(0);
	});

	it('throws ForbiddenError when the inviter has only VIEWER role', async () => {
		await seedViewerMembership();
		const useCase = buildUseCase(['invitee-1' as Uuid, 'mem-1' as Uuid]);

		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				invitedByUserId: VIEWER_USER_ID,
				invitee: {
					email: 'new-user@example.com',
					name: 'New User',
					passwordHash: HASHED_PASSWORD,
				},
				role: IdentityAccess.Roles.MEMBER,
			}),
		).rejects.toBeInstanceOf(ForbiddenError);

		expect(users.size()).toBe(0);
	});

	it('rejects re-invitation of a user already a member of the organization', async () => {
		await seedAdminMembership();
		// First invitation: succeeds.
		const first = buildUseCase(['invitee-1' as Uuid, 'mem-1' as Uuid]);
		await first.execute({
			organizationId: ORG_ID,
			invitedByUserId: ADMIN_USER_ID,
			invitee: {
				email: 'new-user@example.com',
				name: 'New User',
				passwordHash: HASHED_PASSWORD,
			},
			role: IdentityAccess.Roles.MEMBER,
		});
		events.clear();

		// Second invitation for the same email: ConflictError.
		const second = new InviteUserUseCase(
			memberships,
			users,
			clock,
			// existing user → only one id consumed (the membership generator),
			// but executing the use case generates one before the conflict check
			new FixedIdGenerator(['mem-2' as Uuid]),
			events,
		);

		await expect(
			second.execute({
				organizationId: ORG_ID,
				invitedByUserId: ADMIN_USER_ID,
				invitee: {
					email: 'new-user@example.com',
					name: 'New User',
					passwordHash: HASHED_PASSWORD,
				},
				role: IdentityAccess.Roles.MEMBER,
			}),
		).rejects.toBeInstanceOf(ConflictError);

		expect(events.published()).toHaveLength(0);
	});

	it('rejects malformed email addresses before touching the repos', async () => {
		await seedAdminMembership();
		const useCase = buildUseCase(['invitee-1' as Uuid, 'mem-1' as Uuid]);

		await expect(
			useCase.execute({
				organizationId: ORG_ID,
				invitedByUserId: ADMIN_USER_ID,
				invitee: {
					email: 'not-an-email',
					name: 'New User',
					passwordHash: HASHED_PASSWORD,
				},
				role: IdentityAccess.Roles.MEMBER,
			}),
		).rejects.toThrow();
		expect(users.size()).toBe(0);
	});
});
