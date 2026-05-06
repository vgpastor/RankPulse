import { InvalidInputError } from '@rankpulse/shared';

/**
 * Meta Marketing API auth uses a long-lived User or System User access token.
 * The token must include the `ads_read` and `business_management` scopes; the
 * Pixel `/{pixel-id}/stats` endpoint additionally requires that the user has access to
 * the Pixel's owning ad account or business.
 *
 * Tokens are opaque base64url-ish strings (FB calls them "EAAB..." in their
 * docs); we validate length+charset and require at least one alphanumeric so
 * a paste of pure separators (e.g. 40 dashes) doesn't slip through. The
 * charset is deliberately wider than strict base64 because FB occasionally
 * rotates the scheme and we'd rather accept a healthy token than reject one
 * over a trailing dot.
 */
const TOKEN_CHARSET = /^[A-Za-z0-9_-]{40,}$/;
const HAS_ALNUM = /[A-Za-z0-9]/;

export const validateMetaAccessToken = (plaintext: string): string => {
	const trimmed = plaintext.trim();
	if (!TOKEN_CHARSET.test(trimmed) || !HAS_ALNUM.test(trimmed)) {
		throw new InvalidInputError(
			'Meta access token must be 40+ alphanumeric characters (incl. _ -). Generate a long-lived token at developers.facebook.com → Tools → Graph API Explorer (or System User token at business.facebook.com).',
		);
	}
	return trimmed;
};
