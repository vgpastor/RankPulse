import { InvalidInputError } from '@rankpulse/shared';

/**
 * Microsoft Clarity auth: an API token generated under Clarity Settings
 * → Data Export → Generate Token. The token is JWT-shaped (eyJ…) and
 * scoped to a single Clarity project.
 *
 * We validate length+charset shape and otherwise pass through opaque.
 */
const TOKEN_REGEX = /^[A-Za-z0-9_.-]{20,}$/;

export const validateClarityToken = (plaintext: string): string => {
	const trimmed = plaintext.trim();
	if (!TOKEN_REGEX.test(trimmed)) {
		throw new InvalidInputError(
			'Microsoft Clarity API token must be 20+ characters (alphanumerics, ".", "_", "-"). Generate one in Clarity → Settings → Data Export.',
		);
	}
	return trimmed;
};
