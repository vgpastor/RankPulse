import { describe, expect, it } from 'vitest';
import { ClarityProvider } from './provider.js';

const validToken = 'eyJhbGciOiJIUzI1NiJ9.fake.signature_value_padding_here';

describe('ClarityProvider', () => {
	it('exposes clarity-data-export via discover()', () => {
		const ids = new ClarityProvider().discover().map((e) => e.id);
		expect(ids).toEqual(['clarity-data-export']);
	});

	it('validateCredentialPlaintext accepts a JWT-shaped token', () => {
		expect(() => new ClarityProvider().validateCredentialPlaintext(validToken)).not.toThrow();
	});

	it('validateCredentialPlaintext rejects too-short tokens', () => {
		expect(() => new ClarityProvider().validateCredentialPlaintext('short')).toThrow();
	});

	it('paramsSchema rejects numOfDays outside the 1-3 Microsoft cap', () => {
		const ep = new ClarityProvider().discover().find((e) => e.id === 'clarity-data-export');
		expect(ep?.paramsSchema.safeParse({ numOfDays: 0 }).success).toBe(false);
		expect(ep?.paramsSchema.safeParse({ numOfDays: 4 }).success).toBe(false);
		expect(ep?.paramsSchema.safeParse({ numOfDays: 1 }).success).toBe(true);
	});

	it('paramsSchema rejects more than 3 dimensions', () => {
		const ep = new ClarityProvider().discover().find((e) => e.id === 'clarity-data-export');
		expect(
			ep?.paramsSchema.safeParse({ numOfDays: 1, dimensions: ['Browser', 'Device', 'OS', 'Country'] })
				.success,
		).toBe(false);
	});

	it('fetch rejects an unknown endpoint id', async () => {
		const provider = new ClarityProvider();
		await expect(
			provider.fetch('not-real', {}, {
				credential: { plaintextSecret: validToken },
				signal: new AbortController().signal,
			} as never),
		).rejects.toThrow();
	});
});
