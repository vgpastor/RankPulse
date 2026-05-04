import type { PasswordHash } from '../value-objects/password-hash.js';

export interface PasswordHasher {
	hash(plain: string): Promise<PasswordHash>;
	verify(plain: string, hash: PasswordHash): Promise<boolean>;
}
