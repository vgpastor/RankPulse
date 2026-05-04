import { InvalidInputError } from '@rankpulse/shared';

/**
 * Opaque ciphertext + nonce wrapper. The actual encryption happens in
 * infrastructure (libsodium secretbox). The domain layer never holds the
 * plaintext credential.
 *
 * Stored as base64 strings so they can be persisted in JSONB or BYTEA columns
 * without further serialization concerns.
 */
export class EncryptedSecret {
	private constructor(
		public readonly ciphertext: string,
		public readonly nonce: string,
		public readonly lastFour: string,
	) {}

	static fromEnvelope(input: { ciphertext: string; nonce: string; lastFour: string }): EncryptedSecret {
		if (!input.ciphertext || input.ciphertext.length < 8) {
			throw new InvalidInputError('Encrypted secret ciphertext is too short');
		}
		if (!input.nonce || input.nonce.length < 8) {
			throw new InvalidInputError('Encrypted secret nonce is too short');
		}
		if (input.lastFour.length > 12) {
			throw new InvalidInputError('lastFour must be a short fingerprint (max 12 chars)');
		}
		return new EncryptedSecret(input.ciphertext, input.nonce, input.lastFour);
	}
}
