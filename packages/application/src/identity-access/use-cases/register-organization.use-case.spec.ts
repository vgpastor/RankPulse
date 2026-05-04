import { IdentityAccess } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, InvalidInputError, Uuid } from '@rankpulse/shared';
import {
	anEmail,
	aPasswordHash,
	FakePasswordHasher,
	InMemoryMembershipRepository,
	InMemoryOrganizationRepository,
	InMemoryUserRepository,
	RecordingEventPublisher,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RegisterOrganizationUseCase } from './register-organization.use-case.js';

describe('RegisterOrganizationUseCase', () => {
	let organizations: InMemoryOrganizationRepository;
	let users: InMemoryUserRepository;
	let memberships: InMemoryMembershipRepository;
	let hasher: FakePasswordHasher;
	let clock: FakeClock;
	let ids: FixedIdGenerator;
	let events: RecordingEventPublisher;
	let useCase: RegisterOrganizationUseCase;

	const userId = Uuid.generate();
	const orgId = Uuid.generate();
	const membershipId = Uuid.generate();

	beforeEach(() => {
		organizations = new InMemoryOrganizationRepository();
		users = new InMemoryUserRepository();
		memberships = new InMemoryMembershipRepository();
		hasher = new FakePasswordHasher();
		clock = new FakeClock('2026-05-04T10:00:00Z');
		ids = new FixedIdGenerator([userId, orgId, membershipId]);
		events = new RecordingEventPublisher();
		useCase = new RegisterOrganizationUseCase(organizations, users, memberships, hasher, clock, ids, events);
	});

	it('persists organization, owner user and OWNER membership in one go', async () => {
		// Arrange
		const cmd = {
			organizationName: 'PatrolTech',
			slug: 'patroltech',
			owner: { email: 'victor@patroltech.online', name: 'Victor', password: 'super-secure-pw' },
		};

		// Act
		const result = await useCase.execute(cmd);

		// Assert: identifiers come from the generator and are persisted
		expect(result).toEqual({
			organizationId: orgId,
			ownerUserId: userId,
			membershipId,
		});
		expect(organizations.size()).toBe(1);
		expect(users.size()).toBe(1);
		expect(memberships.size()).toBe(1);

		const owner = await users.findByEmail(anEmail('victor@patroltech.online'));
		expect(owner?.name).toBe('Victor');

		const m = await memberships.findActiveFor(
			orgId as IdentityAccess.OrganizationId,
			userId as IdentityAccess.UserId,
		);
		expect(m?.role).toBe(IdentityAccess.Roles.OWNER);
	});

	it('publishes OrganizationCreated when the org is registered', async () => {
		await useCase.execute({
			organizationName: 'PatrolTech',
			slug: 'patroltech',
			owner: { email: 'victor@patroltech.online', name: 'Victor', password: 'super-secure-pw' },
		});

		expect(events.publishedTypes()).toContain('identity-access.OrganizationCreated');
	});

	it('rejects passwords shorter than 12 chars without persisting anything', async () => {
		await expect(
			useCase.execute({
				organizationName: 'PatrolTech',
				slug: 'patroltech',
				owner: { email: 'victor@patroltech.online', name: 'Victor', password: 'short' },
			}),
		).rejects.toBeInstanceOf(InvalidInputError);

		expect(organizations.size()).toBe(0);
		expect(users.size()).toBe(0);
		expect(events.published()).toHaveLength(0);
	});

	it('rejects when the slug is already in use', async () => {
		await organizations.save(
			IdentityAccess.Organization.register({
				id: Uuid.generate() as IdentityAccess.OrganizationId,
				name: 'Existing',
				slug: 'patroltech',
				ownerId: Uuid.generate() as IdentityAccess.UserId,
				now: clock.now(),
			}),
		);

		await expect(
			useCase.execute({
				organizationName: 'New',
				slug: 'patroltech',
				owner: { email: 'new@example.com', name: 'New', password: 'super-secure-pw' },
			}),
		).rejects.toBeInstanceOf(ConflictError);
	});

	it('rejects when the email is already registered', async () => {
		await users.save(
			IdentityAccess.User.register({
				id: Uuid.generate() as IdentityAccess.UserId,
				email: anEmail('victor@patroltech.online'),
				name: 'Victor',
				passwordHash: aPasswordHash(),
				now: clock.now(),
			}),
		);

		await expect(
			useCase.execute({
				organizationName: 'PatrolTech',
				slug: 'patroltech',
				owner: { email: 'victor@patroltech.online', name: 'V', password: 'super-secure-pw' },
			}),
		).rejects.toBeInstanceOf(ConflictError);
	});
});
