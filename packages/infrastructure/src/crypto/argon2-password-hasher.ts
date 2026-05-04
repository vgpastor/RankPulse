import { IdentityAccess } from '@rankpulse/domain';
import * as argon2 from 'argon2';

export interface Argon2Options {
	type?: 0 | 1 | 2;
	memoryCost?: number;
	timeCost?: number;
	parallelism?: number;
}

/**
 * Argon2id password hasher. OWASP recommended defaults: 19 MiB, 2 iterations,
 * 1 lane. The hash format already embeds the parameters and salt, so verify()
 * does not need to know the original options.
 */
export class Argon2PasswordHasher implements IdentityAccess.PasswordHasher {
	private readonly options: Required<Argon2Options>;

	constructor(options?: Argon2Options) {
		this.options = {
			type: options?.type ?? argon2.argon2id,
			memoryCost: options?.memoryCost ?? 19_456,
			timeCost: options?.timeCost ?? 2,
			parallelism: options?.parallelism ?? 1,
		};
	}

	async hash(plain: string): Promise<IdentityAccess.PasswordHash> {
		const hashed = await argon2.hash(plain, this.options);
		return IdentityAccess.PasswordHash.fromHashed(hashed);
	}

	async verify(plain: string, hash: IdentityAccess.PasswordHash): Promise<boolean> {
		try {
			return await argon2.verify(hash.value, plain);
		} catch {
			return false;
		}
	}
}
