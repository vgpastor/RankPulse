import { createHash } from 'node:crypto';
import { ProviderConnectivity } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import sodium from 'libsodium-wrappers';

/**
 * libsodium secretbox-based encryption of provider credentials. The master
 * key (32 bytes) is derived once from the operator-provided
 * `RANKPULSE_MASTER_KEY` env var via SHA-256 — Argon2id-based KDF is reserved
 * for the Phase 2 multi-tenant variant where keys are derived per-org.
 *
 * Each ciphertext carries its own random nonce; a base64 envelope is
 * persisted as `(ciphertext, nonce, lastFour)` in the provider_credentials
 * table.
 */
export class LibsodiumCredentialVault implements ProviderConnectivity.CredentialVault {
	private ready: Promise<void>;
	private key: Uint8Array | null = null;

	constructor(private readonly masterKey: string) {
		if (masterKey.length < 16) {
			throw new InvalidInputError('RANKPULSE_MASTER_KEY must be at least 16 characters');
		}
		this.ready = this.init();
	}

	private async init(): Promise<void> {
		await sodium.ready;
		this.key = new Uint8Array(createHash('sha256').update(this.masterKey).digest());
	}

	async encrypt(plaintext: string): Promise<ProviderConnectivity.EncryptedSecret> {
		await this.ready;
		if (!this.key) throw new Error('Vault not initialized');
		const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
		const cipher = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, this.key);
		const lastFour = plaintext.slice(-4).padStart(4, '*');
		return ProviderConnectivity.EncryptedSecret.fromEnvelope({
			ciphertext: sodium.to_base64(cipher, sodium.base64_variants.ORIGINAL),
			nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
			lastFour,
		});
	}

	async decrypt(secret: ProviderConnectivity.EncryptedSecret): Promise<string> {
		await this.ready;
		if (!this.key) throw new Error('Vault not initialized');
		const cipher = sodium.from_base64(secret.ciphertext, sodium.base64_variants.ORIGINAL);
		const nonce = sodium.from_base64(secret.nonce, sodium.base64_variants.ORIGINAL);
		const plain = sodium.crypto_secretbox_open_easy(cipher, nonce, this.key);
		if (!plain) {
			throw new InvalidInputError('Failed to decrypt provider credential — wrong master key?');
		}
		return sodium.to_string(plain);
	}
}
