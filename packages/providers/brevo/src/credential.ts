import { InvalidInputError } from '@rankpulse/shared';

/**
 * Brevo API v3 keys are minted at Account → SMTP & API → Create API Key. The
 * v3 format is `xkeysib-<64 lowercase hex>-<16 alphanumeric>`; legacy v2 keys
 * (no prefix) still work upstream but Brevo deprecates them and we refuse them
 * here to push operators onto v3 — that way the credential's `last_four` is
 * actually unique enough to disambiguate keys in the UI.
 */
const TOKEN_REGEX = /^xkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}$/;

export const validateBrevoApiKey = (plaintext: string): string => {
	const trimmed = plaintext.trim();
	if (!TOKEN_REGEX.test(trimmed)) {
		throw new InvalidInputError(
			'Brevo API key must match the v3 format `xkeysib-<64-hex>-<16-alphanumeric>`. Generate one at https://app.brevo.com/settings/keys/api',
		);
	}
	return trimmed;
};
