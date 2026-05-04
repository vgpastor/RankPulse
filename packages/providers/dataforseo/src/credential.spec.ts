import { describe, expect, it } from 'vitest';
import { buildBasicAuthHeader, parseCredential } from './credential.js';

describe('parseCredential', () => {
	it('splits a "email|api_password" string', () => {
		const creds = parseCredential('vgpastor@patroltech.online|secret-pwd');
		expect(creds.email).toBe('vgpastor@patroltech.online');
		expect(creds.apiPassword).toBe('secret-pwd');
	});

	it('keeps password parts that contain pipes', () => {
		const creds = parseCredential('user@x.com|pass|with|pipes');
		expect(creds.apiPassword).toBe('pass|with|pipes');
	});

	it('rejects malformed credentials', () => {
		expect(() => parseCredential('no-pipe-here')).toThrowError(/email\|api_password/);
		expect(() => parseCredential('user@x.com|')).toThrowError(/api password missing/);
	});
});

describe('buildBasicAuthHeader', () => {
	it('produces RFC 7617 Basic header', () => {
		const header = buildBasicAuthHeader({ email: 'foo@bar.com', apiPassword: 'baz' });
		expect(header).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
		expect(Buffer.from(header.replace('Basic ', ''), 'base64').toString()).toBe('foo@bar.com:baz');
	});
});
