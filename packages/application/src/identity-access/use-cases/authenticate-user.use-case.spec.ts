import { IdentityAccess } from '@rankpulse/domain';
import { UnauthorizedError, Uuid } from '@rankpulse/shared';
import { FakePasswordHasher, InMemoryUserRepository, anEmail } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthenticateUserUseCase } from './authenticate-user.use-case.js';

describe('AuthenticateUserUseCase', () => {
	let users: InMemoryUserRepository;
	let hasher: FakePasswordHasher;
	let useCase: AuthenticateUserUseCase;

	beforeEach(async () => {
		users = new InMemoryUserRepository();
		hasher = new FakePasswordHasher();
		useCase = new AuthenticateUserUseCase(users, hasher);

		const passwordHash = await hasher.hash('correct-horse-battery');
		await users.save(
			IdentityAccess.User.register({
				id: Uuid.generate() as IdentityAccess.UserId,
				email: anEmail('victor@patroltech.online'),
				name: 'Victor',
				passwordHash,
				now: new Date('2026-05-04T10:00:00Z'),
			}),
		);
	});

	it('returns the authenticated user when credentials match', async () => {
		const result = await useCase.execute({
			email: 'victor@patroltech.online',
			password: 'correct-horse-battery',
		});

		expect(result.email).toBe('victor@patroltech.online');
		expect(result.name).toBe('Victor');
	});

	it('rejects unknown emails with the same UnauthorizedError as wrong passwords', async () => {
		await expect(
			useCase.execute({ email: 'unknown@example.com', password: 'whatever' }),
		).rejects.toBeInstanceOf(UnauthorizedError);
	});

	it('rejects wrong passwords', async () => {
		await expect(
			useCase.execute({ email: 'victor@patroltech.online', password: 'wrong' }),
		).rejects.toBeInstanceOf(UnauthorizedError);
	});
});
