import { describe, expect, it } from 'vitest';
import { Sha256ApiTokenGenerator } from './sha256-api-token-generator.js';

describe('Sha256ApiTokenGenerator', () => {
	const generator = new Sha256ApiTokenGenerator();

	it('issues a prefixed plaintext and the matching SHA-256 hash', () => {
		const { plaintext, hashed } = generator.issue();
		expect(plaintext).toMatch(/^rpat_[A-Za-z0-9_-]+$/);
		expect(hashed).toMatch(/^[0-9a-f]{64}$/);
		expect(generator.hash(plaintext)).toBe(hashed);
	});

	it('produces unique tokens on each call', () => {
		const a = generator.issue();
		const b = generator.issue();
		expect(a.plaintext).not.toBe(b.plaintext);
		expect(a.hashed).not.toBe(b.hashed);
	});

	it('hash() is deterministic for the same input', () => {
		expect(generator.hash('rpat_constant')).toBe(generator.hash('rpat_constant'));
	});
});
