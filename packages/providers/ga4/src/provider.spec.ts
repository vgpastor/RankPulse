import { describe, expect, it } from 'vitest';
import { RunReportParams } from './endpoints/run-report.js';
import { Ga4Provider } from './provider.js';

const validServiceAccountJson = JSON.stringify({
	type: 'service_account',
	project_id: 'rankpulse',
	client_email: 'claude-access@rankpulse.iam.gserviceaccount.com',
	private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
});

describe('Ga4Provider', () => {
	it('exposes the run-report endpoint via discover()', () => {
		const provider = new Ga4Provider();
		const ids = provider.discover().map((e) => e.id);
		expect(ids).toContain('ga4-run-report');
	});

	it('validateCredentialPlaintext accepts a service account JSON blob', () => {
		const provider = new Ga4Provider();
		expect(() => provider.validateCredentialPlaintext(validServiceAccountJson)).not.toThrow();
	});

	it('validateCredentialPlaintext rejects non-JSON plaintext', () => {
		const provider = new Ga4Provider();
		expect(() => provider.validateCredentialPlaintext('not-json')).toThrow();
	});

	it('validateCredentialPlaintext rejects JSON missing client_email/private_key', () => {
		const provider = new Ga4Provider();
		expect(() => provider.validateCredentialPlaintext(JSON.stringify({ project_id: 'x' }))).toThrow();
	});

	it('paramsSchema accepts a numeric propertyId', () => {
		const provider = new Ga4Provider();
		const ep = provider.discover().find((e) => e.id === 'ga4-run-report');
		const parsed = ep?.paramsSchema.safeParse({
			propertyId: '123456789',
			startDate: '2026-05-01',
			endDate: '2026-05-02',
		});
		expect(parsed?.success).toBe(true);
	});

	it('paramsSchema accepts a "properties/<id>" propertyId', () => {
		const provider = new Ga4Provider();
		const ep = provider.discover().find((e) => e.id === 'ga4-run-report');
		const parsed = ep?.paramsSchema.safeParse({
			propertyId: 'properties/123456789',
			startDate: '{{today-30}}',
			endDate: '{{today-2}}',
		});
		expect(parsed?.success).toBe(true);
	});

	it('paramsSchema rejects a propertyId that contains letters', () => {
		const provider = new Ga4Provider();
		const ep = provider.discover().find((e) => e.id === 'ga4-run-report');
		const parsed = ep?.paramsSchema.safeParse({
			propertyId: 'GA-12345',
			startDate: '2026-05-01',
			endDate: '2026-05-02',
		});
		expect(parsed?.success).toBe(false);
	});

	it('paramsSchema rejects more than 9 dimensions (GA4 hard limit)', () => {
		const provider = new Ga4Provider();
		const ep = provider.discover().find((e) => e.id === 'ga4-run-report');
		const parsed = ep?.paramsSchema.safeParse({
			propertyId: '1',
			startDate: '2026-05-01',
			endDate: '2026-05-02',
			dimensions: Array.from({ length: 10 }, (_, i) => `dim${i}`),
		});
		expect(parsed?.success).toBe(false);
	});

	it('paramsSchema applies defaults for metrics and rowLimit', () => {
		const parsed = RunReportParams.safeParse({
			propertyId: '1',
			startDate: '2026-05-01',
			endDate: '2026-05-02',
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.metrics).toContain('sessions');
			expect(parsed.data.rowLimit).toBe(10_000);
		}
	});

	it('fetch rejects an unknown endpoint id', async () => {
		const provider = new Ga4Provider();
		await expect(
			provider.fetch('not-a-real-endpoint', {}, {
				credential: { plaintextSecret: validServiceAccountJson },
				signal: new AbortController().signal,
			} as never),
		).rejects.toThrow();
	});
});
