import { describe, expect, it } from 'vitest';
import { GscProvider } from './provider.js';

const validServiceAccountJson = JSON.stringify({
	type: 'service_account',
	project_id: 'rankpulse',
	client_email: 'claude-access@ingenierosweb.iam.gserviceaccount.com',
	private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
});

describe('GscProvider', () => {
	it('exposes the search-analytics endpoint via discover()', () => {
		const provider = new GscProvider();
		const ids = provider.discover().map((e) => e.id);
		expect(ids).toContain('gsc-search-analytics');
	});

	it('validateCredentialPlaintext accepts a service account JSON blob', () => {
		const provider = new GscProvider();
		expect(() => provider.validateCredentialPlaintext(validServiceAccountJson)).not.toThrow();
	});

	it('validateCredentialPlaintext rejects non-JSON plaintext', () => {
		const provider = new GscProvider();
		expect(() => provider.validateCredentialPlaintext('not-json')).toThrow();
	});

	it('validateCredentialPlaintext rejects JSON missing client_email/private_key', () => {
		const provider = new GscProvider();
		expect(() => provider.validateCredentialPlaintext(JSON.stringify({ project_id: 'x' }))).toThrow();
	});
});
