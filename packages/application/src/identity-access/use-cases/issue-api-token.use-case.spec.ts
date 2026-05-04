import { IdentityAccess } from '@rankpulse/domain';
import { FakeClock, FixedIdGenerator, ForbiddenError, NotFoundError, Uuid } from '@rankpulse/shared';
import {
	FakeApiTokenGenerator,
	InMemoryApiTokenRepository,
	InMemoryMembershipRepository,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IssueApiTokenUseCase } from './issue-api-token.use-case.js';

describe('IssueApiTokenUseCase', () => {
	let memberships: InMemoryMembershipRepository;
	let tokens: InMemoryApiTokenRepository;
	let generator: FakeApiTokenGenerator;
	let clock: FakeClock;
	let ids: FixedIdGenerator;
	let useCase: IssueApiTokenUseCase;

	const orgId = Uuid.generate() as IdentityAccess.OrganizationId;
	const adminUserId = Uuid.generate() as IdentityAccess.UserId;
	const memberUserId = Uuid.generate() as IdentityAccess.UserId;
	const tokenId = Uuid.generate();

	beforeEach(async () => {
		memberships = new InMemoryMembershipRepository();
		tokens = new InMemoryApiTokenRepository();
		generator = new FakeApiTokenGenerator();
		clock = new FakeClock('2026-05-04T10:00:00Z');
		ids = new FixedIdGenerator([tokenId]);
		useCase = new IssueApiTokenUseCase(memberships, tokens, generator, clock, ids);

		await memberships.save(
			IdentityAccess.Membership.grant({
				id: Uuid.generate() as IdentityAccess.MembershipId,
				organizationId: orgId,
				userId: adminUserId,
				role: IdentityAccess.Roles.ADMIN,
				now: clock.now(),
			}),
		);
		await memberships.save(
			IdentityAccess.Membership.grant({
				id: Uuid.generate() as IdentityAccess.MembershipId,
				organizationId: orgId,
				userId: memberUserId,
				role: IdentityAccess.Roles.MEMBER,
				now: clock.now(),
			}),
		);
	});

	it('admin can issue a token, plaintext returned once and only the hash persisted', async () => {
		const result = await useCase.execute({
			organizationId: orgId,
			requestedByUserId: adminUserId,
			name: 'CI bot',
			scopes: ['projects:read'],
			expiresAt: null,
		});

		expect(result.tokenId).toBe(tokenId);
		expect(result.plaintextToken).toMatch(/^rp_test_/);

		const stored = await tokens.findById(tokenId as IdentityAccess.ApiTokenId);
		expect(stored?.hashedToken.startsWith('sha256:')).toBe(true);
		expect(stored?.hashedToken).not.toContain(result.plaintextToken.slice(-4));
		expect(stored?.scopes).toEqual(['projects:read']);
	});

	it('rejects MEMBER role with ForbiddenError', async () => {
		await expect(
			useCase.execute({
				organizationId: orgId,
				requestedByUserId: memberUserId,
				name: 'CI bot',
				scopes: [],
				expiresAt: null,
			}),
		).rejects.toBeInstanceOf(ForbiddenError);
		expect(tokens.size()).toBe(0);
	});

	it('rejects when the user has no active membership', async () => {
		await expect(
			useCase.execute({
				organizationId: orgId,
				requestedByUserId: Uuid.generate(),
				name: 'CI bot',
				scopes: [],
				expiresAt: null,
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
