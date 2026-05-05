import { InvalidInputError } from '@rankpulse/shared';

/**
 * Bing Webmaster Tools auth: a single API key, scoped to the user account
 * that owns the verified site. The key is generated in Bing Webmaster
 * Settings → API Access; one key gives access to every site verified by
 * that account, so the cascade resolution maps it at the org level.
 *
 * Plaintext is the bare key string — no JSON envelope.
 */
const KEY_REGEX = /^[A-Za-z0-9]{20,}$/;

export const validateBingApiKey = (plaintext: string): string => {
	const trimmed = plaintext.trim();
	if (!KEY_REGEX.test(trimmed)) {
		throw new InvalidInputError(
			'Bing Webmaster API key must be at least 20 alphanumeric characters (Settings → API Access)',
		);
	}
	return trimmed;
};
