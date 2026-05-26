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

	// --- Task-level status validation (regression tests for #179) ---
	//
	// DataForSEO returns envelope `status_code: 20000` even when individual
	// tasks fail with 4xxxx — the per-task status is the actual outcome.
	// Prior implementation only inspected the envelope, so a 40204 "no
	// Backlinks subscription" arrived as a "succeeded" run, charged the
	// operator's ledger, and persisted an empty payload that the ACL
	// translated to `totalBacklinks: 0`. These cases pin the contract so
	// any future regression surfaces in CI rather than in production.

	it('throws when the envelope is ok but a task reports 40204 (subscription denied)', () => {
		expect(() =>
			ensureTaskOk('/v3/backlinks/summary/live', {
				status_code: 20000,
				status_message: 'Ok.',
				tasks: [
					{
						status_code: 40204,
						status_message:
							'Access denied. Visit Plans and Subscriptions to activate your subscription and get access to this API.',
					},
				],
			}),
		).toThrow(DataForSeoApiError);
	});

	it('surfaces the failing task status (not the envelope status) in the thrown error', () => {
		try {
			ensureTaskOk('/v3/backlinks/summary/live', {
				status_code: 20000,
				status_message: 'Ok.',
				tasks: [{ status_code: 40204, status_message: 'Access denied.' }],
			});
			expect.fail('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(DataForSeoApiError);
			expect((err as DataForSeoApiError).status).toBe(40204);
			expect((err as Error).message).toContain('40204');
			expect((err as Error).message).toContain('Access denied');
			expect((err as Error).message).toContain('/v3/backlinks/summary/live');
		}
	});

	it('returns silently when envelope and all tasks are ok', () => {
		expect(() =>
			ensureTaskOk('/v3/test', {
				status_code: 20000,
				status_message: 'Ok.',
				tasks: [
					{ status_code: 20000, status_message: 'Ok.' },
					{ status_code: 20000, status_message: 'Ok.' },
				],
			}),
		).not.toThrow();
	});

	it('returns silently when a task uses an informational success code (20100)', () => {
		expect(() =>
			ensureTaskOk('/v3/test', {
				status_code: 20000,
				status_message: 'Ok.',
				tasks: [{ status_code: 20100, status_message: 'No results for the requested keyword.' }],
			}),
		).not.toThrow();
	});

	it('throws on the first failing task in a multi-task response', () => {
		try {
			ensureTaskOk('/v3/test', {
				status_code: 20000,
				status_message: 'Ok.',
				tasks: [
					{ status_code: 20000, status_message: 'Ok.' },
					{ status_code: 40501, status_message: 'Monthly limit reached.' },
					{ status_code: 20000, status_message: 'Ok.' },
				],
			});
			expect.fail('should have thrown');
		} catch (err) {
			expect((err as DataForSeoApiError).status).toBe(40501);
			expect((err as Error).message).toContain('Monthly limit reached');
		}
	});

	it('returns silently when the response omits the tasks array (backward compatibility)', () => {
		expect(() => ensureTaskOk('/v3/test', { status_code: 20000, status_message: 'Ok.' })).not.toThrow();
	});

	it('returns silently when the tasks array is empty', () => {
		expect(() =>
			ensureTaskOk('/v3/test', { status_code: 20000, status_message: 'Ok.', tasks: [] }),
		).not.toThrow();
	});
});
