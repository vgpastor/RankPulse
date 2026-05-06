import { describe, expect, it } from 'vitest';
import { Citation } from './citation.js';

describe('Citation.fromUrl', () => {
	it('extracts the host and lowercases it', () => {
		const c = Citation.fromUrl('https://Example.COM/path?q=1', []);
		expect(c.domain).toBe('example.com');
		expect(c.url).toBe('https://Example.COM/path?q=1');
	});

	it('drops the leading www.', () => {
		const c = Citation.fromUrl('https://www.example.com/blog', []);
		expect(c.domain).toBe('example.com');
	});

	it('flags isOwnDomain when the host matches an own domain exactly or as subdomain', () => {
		expect(Citation.fromUrl('https://example.com/x', ['example.com']).isOwnDomain).toBe(true);
		expect(Citation.fromUrl('https://blog.example.com/x', ['example.com']).isOwnDomain).toBe(true);
		expect(Citation.fromUrl('https://other.com', ['example.com']).isOwnDomain).toBe(false);
	});

	it('falls back to the raw URL when parsing fails', () => {
		const c = Citation.fromUrl('not-a-real-url', []);
		expect(c.url).toBe('not-a-real-url');
		expect(c.domain).toBe('not-a-real-url');
	});
});
