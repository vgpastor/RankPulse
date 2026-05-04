import { InvalidInputError } from '@rankpulse/shared';

/**
 * DataForSEO uses HTTP Basic with `login:password`. We persist that as a
 * single plaintext string in the form `email|api_password` and split here.
 */
export interface DataForSeoCredentials {
	email: string;
	apiPassword: string;
}

export const parseCredential = (plaintext: string): DataForSeoCredentials => {
	const [email, ...rest] = plaintext.split('|');
	if (!email || rest.length === 0) {
		throw new InvalidInputError('DataForSEO credential must be "email|api_password"');
	}
	const apiPassword = rest.join('|');
	if (apiPassword.length === 0) {
		throw new InvalidInputError('DataForSEO api password missing');
	}
	return { email: email.trim(), apiPassword };
};

export const buildBasicAuthHeader = (creds: DataForSeoCredentials): string => {
	const token = Buffer.from(`${creds.email}:${creds.apiPassword}`).toString('base64');
	return `Basic ${token}`;
};
