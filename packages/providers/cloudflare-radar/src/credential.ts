import { InvalidInputError } from '@rankpulse/shared';

/**
 * Cloudflare Radar auth: a single API token (not the legacy API key).
 * The token must have the `Radar:Read` permission scope. Tokens are 40
 * alphanumerics including underscore/dash; we validate length+charset
 * and otherwise pass through opaque.
 */
const TOKEN_REGEX = /^[A-Za-z0-9_-]{20,}$/;

export const validateCloudflareToken = (plaintext: string): string => {
	const trimmed = plaintext.trim();
	if (!TOKEN_REGEX.test(trimmed)) {
		throw new InvalidInputError(
			'Cloudflare API token must be 20+ alphanumeric characters (incl. _ -). Generate one with the Radar:Read scope at dash.cloudflare.com → My Profile → API Tokens',
		);
	}
	return trimmed;
};
