import { describe, expect, it } from 'vitest';
import { DataForSeoApiError, ensureTaskOk } from './http.js';

describe('ensureTaskOk', () => {
	it('returns silently for the canonical success status (20000)', () => {
		expect(() => ensureTaskOk('/v3/test', { status_code: 20000, status_message: 'Ok.' })).not.toThrow();
	});

	it('treats informational 20100-20999 as success', () => {
		expect(() =>
			ensureTaskOk('/v3/test', { status_code: 20100, status_message: 'No results.' }),
		).not.toThrow();
		expect(() => ensureTaskOk('/v3/test', { status_code: 20999, status_message: 'Edge.' })).not.toThrow();
	});

	it('throws DataForSeoApiError for client errors (40xxx)', () => {
		expect(() => ensureTaskOk('/v3/test', { status_code: 40101, status_message: 'Auth failed' })).toThrow(
			DataForSeoApiError,
		);
	});

	it('throws DataForSeoApiError for quota body codes (40402, 40501)', () => {
		expect(() => ensureTaskOk('/v3/test', { status_code: 40402, status_message: 'No balance' })).toThrow(
			DataForSeoApiError,
		);
		expect(() =>
			ensureTaskOk('/v3/test', { status_code: 40501, status_message: 'Monthly limit reached' }),
		).toThrow(DataForSeoApiError);
	});

	it('throws DataForSeoApiError for server errors (50xxx)', () => {
		expect(() => ensureTaskOk('/v3/test', { status_code: 50000, status_message: 'Internal error' })).toThrow(
			DataForSeoApiError,
		);
	});

	it('throws at the boundary 30000 (no informational range above 29999)', () => {
		expect(() => ensureTaskOk('/v3/test', { status_code: 30000, status_message: 'Unknown' })).toThrow(
			DataForSeoApiError,
		);
	});

	it('preserves status code and message on the thrown error', () => {
		try {
			ensureTaskOk('/v3/serp', { status_code: 40402, status_message: 'No balance' });
			expect.fail('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(DataForSeoApiError);
			expect((err as DataForSeoApiError).status).toBe(40402);
			expect((err as Error).message).toContain('40402');
			expect((err as Error).message).toContain('No balance');
			expect((err as Error).message).toContain('/v3/serp');
		}
	});
});
