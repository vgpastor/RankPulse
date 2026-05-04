import { InvalidInputError } from '@rankpulse/shared';

/**
 * Plaintext envelope for a GSC credential. v1 supports a Service Account JSON
 * (from the user's existing `claude-access@...` key). OAuth user flow is a
 * future iteration.
 *
 * The encrypted payload stored by the vault is the full service account JSON
 * blob as-is.
 */
export interface ServiceAccountKey {
	client_email: string;
	private_key: string;
	[k: string]: unknown;
}

export const parseServiceAccount = (plaintext: string): ServiceAccountKey => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(plaintext);
	} catch {
		throw new InvalidInputError('GSC credential must be a Service Account JSON blob');
	}
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		typeof (parsed as ServiceAccountKey).client_email !== 'string' ||
		typeof (parsed as ServiceAccountKey).private_key !== 'string'
	) {
		throw new InvalidInputError('Service account JSON must contain client_email and private_key');
	}
	return parsed as ServiceAccountKey;
};
