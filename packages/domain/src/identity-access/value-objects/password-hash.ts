import { InvalidInputError } from '@rankpulse/shared';

/**
 * Opaque value object wrapping an already-hashed password.
 *
 * The actual hashing is performed by infrastructure (Argon2id adapter behind
 * the {@link PasswordHasher} port). The domain layer never sees the plain text.
 */
export class PasswordHash {
	private constructor(public readonly value: string) {}

	static fromHashed(hashed: string): PasswordHash {
		if (!hashed || hashed.length < 16) {
			throw new InvalidInputError('PasswordHash value is too short to be a real hash');
		}
		return new PasswordHash(hashed);
	}

	equals(other: PasswordHash): boolean {
		return this.value === other.value;
	}
}
