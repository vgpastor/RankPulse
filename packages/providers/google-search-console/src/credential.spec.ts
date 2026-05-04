import { describe, expect, it } from 'vitest';
import { parseServiceAccount } from './credential.js';

describe('parseServiceAccount', () => {
	it('parses a minimal service account JSON', () => {
		const sa = parseServiceAccount(
			JSON.stringify({
				type: 'service_account',
				project_id: 'rankpulse',
				client_email: 'claude-access@ingenierosweb.iam.gserviceaccount.com',
				private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
			}),
		);
		expect(sa.client_email).toBe('claude-access@ingenierosweb.iam.gserviceaccount.com');
		expect(sa.private_key).toContain('BEGIN PRIVATE KEY');
	});

	it('rejects non-JSON', () => {
		expect(() => parseServiceAccount('not json')).toThrowError(/Service Account JSON/);
	});

	it('rejects JSON missing required fields', () => {
		expect(() => parseServiceAccount(JSON.stringify({ client_email: 'x' }))).toThrowError(
			/client_email and private_key/,
		);
	});
});
