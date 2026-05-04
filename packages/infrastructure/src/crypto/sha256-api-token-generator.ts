import { createHash, randomBytes } from 'node:crypto';
import type { IdentityAccess } from '@rankpulse/domain';

const PREFIX = 'rpat_';

/**
 * Issues opaque API tokens (32 random bytes, base64url) and stores only the
 * SHA-256 hash. Plaintext is shown to the user once at creation time.
 *
 * SHA-256 is acceptable here because the token has 256 bits of entropy: a
 * preimage attack is computationally infeasible. We avoid Argon2 because
 * authenticating each request must be sub-millisecond.
 */
export class Sha256ApiTokenGenerator implements IdentityAccess.ApiTokenGenerator {
	issue(): { plaintext: string; hashed: string } {
		const raw = randomBytes(32).toString('base64url');
		const plaintext = `${PREFIX}${raw}`;
		return { plaintext, hashed: this.hash(plaintext) };
	}

	hash(plaintext: string): string {
		return createHash('sha256').update(plaintext).digest('hex');
	}
}
