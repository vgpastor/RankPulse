import { IdentityAccess } from '@rankpulse/domain';

/**
 * Deterministic, reversible "hasher" for tests. Never use outside tests.
 * Produces a hash long enough to satisfy {@link IdentityAccess.PasswordHash} invariants.
 */
export class FakePasswordHasher implements IdentityAccess.PasswordHasher {
	async hash(plain: string): Promise<IdentityAccess.PasswordHash> {
		return IdentityAccess.PasswordHash.fromHashed(`fake$${'0'.repeat(16)}$${plain}`);
	}

	async verify(plain: string, hash: IdentityAccess.PasswordHash): Promise<boolean> {
		return hash.value === `fake$${'0'.repeat(16)}$${plain}`;
	}
}
