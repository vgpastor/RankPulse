import { InvalidInputError } from '@rankpulse/shared';

/**
 * GA4 Data API credentials. The same Service Account JSON shape Google uses
 * everywhere — we share the parser with GSC because both APIs accept the
 * exact same `{client_email, private_key}` envelope.
 *
 * The SA must be added as a Viewer on the GA4 property
 * (Admin -> Property Access Management) before any call succeeds.
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
		throw new InvalidInputError('GA4 credential must be a Service Account JSON blob');
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
