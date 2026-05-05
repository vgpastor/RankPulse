import { describe, expect, it } from 'vitest';
import { BingProvider } from './provider.js';

const validApiKey = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';

describe('BingProvider', () => {
	it('exposes both rank-and-traffic-stats and query-stats endpoints via discover()', () => {
		const ids = new BingProvider().discover().map((e) => e.id);
		expect(ids).toContain('bing-rank-and-traffic-stats');
		expect(ids).toContain('bing-query-stats');
	});

	it('validateCredentialPlaintext accepts a normal API key', () => {
		expect(() => new BingProvider().validateCredentialPlaintext(validApiKey)).not.toThrow();
	});

	it('validateCredentialPlaintext rejects empty / too-short keys', () => {
		expect(() => new BingProvider().validateCredentialPlaintext('')).toThrow();
		expect(() => new BingProvider().validateCredentialPlaintext('short')).toThrow();
	});

	it('validateCredentialPlaintext rejects non-alphanumeric keys', () => {
		expect(() => new BingProvider().validateCredentialPlaintext('has-dashes-which-bing-keys-dont')).toThrow();
		expect(() => new BingProvider().validateCredentialPlaintext('contains spaces hereaaaaaaaaa')).toThrow();
	});

	it('paramsSchema rejects a non-URL siteUrl on rank-and-traffic-stats', () => {
		const ep = new BingProvider().discover().find((e) => e.id === 'bing-rank-and-traffic-stats');
		expect(ep?.paramsSchema.safeParse({ siteUrl: 'example.com' }).success).toBe(false);
		expect(ep?.paramsSchema.safeParse({ siteUrl: 'https://example.com/' }).success).toBe(true);
	});

	it('fetch rejects an unknown endpoint id', async () => {
		const provider = new BingProvider();
		await expect(
			provider.fetch('not-real', {}, {
				credential: { plaintextSecret: validApiKey },
				signal: new AbortController().signal,
			} as never),
		).rejects.toThrow();
	});
});
