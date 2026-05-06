import { describe, expect, it } from 'vitest';
import { CloudflareRadarProvider } from './provider.js';

const validToken = 'cf_test_TokenValue1234567890_abcXYZ';

describe('CloudflareRadarProvider', () => {
	it('exposes radar-domain-rank via discover()', () => {
		const ids = new CloudflareRadarProvider().discover().map((e) => e.id);
		expect(ids).toEqual(['radar-domain-rank']);
	});

	it('validateCredentialPlaintext accepts a normal Cloudflare API token', () => {
		expect(() => new CloudflareRadarProvider().validateCredentialPlaintext(validToken)).not.toThrow();
	});

	it('validateCredentialPlaintext rejects empty or too-short tokens', () => {
		expect(() => new CloudflareRadarProvider().validateCredentialPlaintext('')).toThrow();
		expect(() => new CloudflareRadarProvider().validateCredentialPlaintext('too-short')).toThrow();
	});

	it('paramsSchema rejects a domain that includes a scheme', () => {
		const ep = new CloudflareRadarProvider().discover().find((e) => e.id === 'radar-domain-rank');
		expect(ep?.paramsSchema.safeParse({ domain: 'https://example.com' }).success).toBe(false);
	});

	it('paramsSchema accepts a bare domain and applies POPULAR default', () => {
		const ep = new CloudflareRadarProvider().discover().find((e) => e.id === 'radar-domain-rank');
		const parsed = ep?.paramsSchema.safeParse({ domain: 'example.com' });
		expect(parsed?.success).toBe(true);
	});

	it('fetch rejects an unknown endpoint id', async () => {
		const provider = new CloudflareRadarProvider();
		await expect(
			provider.fetch('not-real', {}, {
				credential: { plaintextSecret: validToken },
				signal: new AbortController().signal,
			} as never),
		).rejects.toThrow();
	});
});
