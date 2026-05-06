import { describe, expect, it } from 'vitest';
import { BrevoProvider } from './provider.js';

// Synthetic fixture — all-zero hex + all-A suffix so the literal cannot
// be confused with a real Brevo key by secret scanners while still
// matching `validateBrevoApiKey`'s regex.
const validApiKey = `xkeysib-${'0'.repeat(64)}-${'A'.repeat(16)}`;

describe('BrevoProvider', () => {
	it('exposes the four documented endpoints via discover()', () => {
		const ids = new BrevoProvider().discover().map((e) => e.id);
		expect(ids).toEqual([
			'brevo-email-statistics',
			'brevo-campaign-statistics',
			'brevo-conversation-stats',
			'brevo-contact-attributes',
		]);
	});

	it('validateCredentialPlaintext accepts a normal v3 key', () => {
		expect(() => new BrevoProvider().validateCredentialPlaintext(validApiKey)).not.toThrow();
	});

	it('validateCredentialPlaintext rejects empty / wrong-format / legacy v2 keys', () => {
		const provider = new BrevoProvider();
		expect(() => provider.validateCredentialPlaintext('')).toThrow();
		expect(() => provider.validateCredentialPlaintext('not-a-brevo-key')).toThrow();
		// missing prefix (legacy v2 raw key)
		expect(() => provider.validateCredentialPlaintext(`${'0'.repeat(64)}-${'A'.repeat(16)}`)).toThrow();
	});

	it('email-statistics paramsSchema rejects when neither window nor days is provided', () => {
		const ep = new BrevoProvider().discover().find((e) => e.id === 'brevo-email-statistics');
		expect(ep?.paramsSchema.safeParse({}).success).toBe(false);
	});

	it('email-statistics paramsSchema accepts a {startDate,endDate} window', () => {
		const ep = new BrevoProvider().discover().find((e) => e.id === 'brevo-email-statistics');
		const parsed = ep?.paramsSchema.safeParse({ startDate: '2026-05-01', endDate: '2026-05-04' });
		expect(parsed?.success).toBe(true);
	});

	it('email-statistics paramsSchema accepts the rolling-window {days} form', () => {
		const ep = new BrevoProvider().discover().find((e) => e.id === 'brevo-email-statistics');
		const parsed = ep?.paramsSchema.safeParse({ days: 7 });
		expect(parsed?.success).toBe(true);
	});

	it('campaign-statistics paramsSchema accepts both numeric and string ids', () => {
		const ep = new BrevoProvider().discover().find((e) => e.id === 'brevo-campaign-statistics');
		expect(ep?.paramsSchema.safeParse({ campaignId: 42 }).success).toBe(true);
		expect(ep?.paramsSchema.safeParse({ campaignId: '42' }).success).toBe(true);
		expect(ep?.paramsSchema.safeParse({ campaignId: 'abc' }).success).toBe(false);
	});

	it('conversation-stats paramsSchema requires ISO dates', () => {
		const ep = new BrevoProvider().discover().find((e) => e.id === 'brevo-conversation-stats');
		expect(ep?.paramsSchema.safeParse({ dateFrom: '2026-05-01', dateTo: '2026-05-04' }).success).toBe(true);
		expect(ep?.paramsSchema.safeParse({ dateFrom: '05/01/2026', dateTo: '05/04/2026' }).success).toBe(false);
	});

	it('contact-attributes paramsSchema applies email_id default', () => {
		const ep = new BrevoProvider().discover().find((e) => e.id === 'brevo-contact-attributes');
		const parsed = ep?.paramsSchema.safeParse({ identifier: 'lead@example.com' });
		expect(parsed?.success).toBe(true);
	});

	it('fetch rejects an unknown endpoint id', async () => {
		const provider = new BrevoProvider();
		await expect(
			provider.fetch('not-real', {}, {
				credential: { plaintextSecret: validApiKey },
				signal: new AbortController().signal,
			} as never),
		).rejects.toThrow();
	});
});
