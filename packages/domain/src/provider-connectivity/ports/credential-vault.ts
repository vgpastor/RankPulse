import type { EncryptedSecret } from '../value-objects/encrypted-secret.js';

/**
 * Symmetric encryption boundary. The domain stores only the {@link EncryptedSecret}
 * envelope; the vault adapter (libsodium secretbox) does the encrypt/decrypt.
 */
export interface CredentialVault {
	encrypt(plaintext: string): Promise<EncryptedSecret>;
	decrypt(secret: EncryptedSecret): Promise<string>;
}
