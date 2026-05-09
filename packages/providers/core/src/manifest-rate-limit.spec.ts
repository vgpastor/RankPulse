import { describe, expect, it } from 'vitest';
import type { ProviderManifest } from './manifest.js';
import { effectiveQueueRateLimit } from './manifest.js';

const buildManifest = (rates: { max: number; durationMs: number }[]): ProviderManifest =>
	({
		id: 'fake',
		displayName: 'Fake',
		http: { baseUrl: 'https://x', auth: { kind: 'bearer-token' } },
		endpoints: rates.map((r, i) => ({
			descriptor: {
				id: `ep-${i}`,
				category: 'rankings',
				displayName: 'x',
				description: 'x',
				paramsSchema: undefined as never,
				cost: { unit: 'usd_cents', amount: 0 },
				defaultCron: '0 0 * * *',
				rateLimit: r,
			},
			fetch: () => Promise.resolve({}),
			ingest: null,
		})),
		validateCredentialPlaintext() {},
		buildHttpClient: () => undefined as never,
	}) as unknown as ProviderManifest;

describe('effectiveQueueRateLimit', () => {
	it('returns null for an empty manifest', () => {
		expect(effectiveQueueRateLimit(buildManifest([]))).toBeNull();
	});

	it('returns the only endpoint rate when there is exactly one', () => {
		const r = effectiveQueueRateLimit(buildManifest([{ max: 1, durationMs: 1000 }]));
		expect(r).toEqual({ max: 1, duration: 1000 });
	});

	it('picks the most restrictive policy when several endpoints declare different rates', () => {
		// PageSpeed-like (1/s) vs DataForSEO-like (2000/min). PSI is more
		// restrictive (1 token/ms vs ~33 tokens/ms).
		const r = effectiveQueueRateLimit(
			buildManifest([
				{ max: 2000, durationMs: 60_000 },
				{ max: 1, durationMs: 1_000 },
			]),
		);
		expect(r).toEqual({ max: 1, duration: 1_000 });
	});

	it('treats equal token-rates by keeping the first encountered', () => {
		// 60/min and 1/s are the same token-rate (1/s). Either is correct;
		// pin the deterministic outcome (first wins).
		const r = effectiveQueueRateLimit(
			buildManifest([
				{ max: 60, durationMs: 60_000 },
				{ max: 1, durationMs: 1_000 },
			]),
		);
		expect(r).toEqual({ max: 60, duration: 60_000 });
	});

	it('compares by tokens-per-time, not by raw `max`', () => {
		// 100/min (~1.67/s) is MORE restrictive than 200/s.
		const r = effectiveQueueRateLimit(
			buildManifest([
				{ max: 200, durationMs: 1_000 },
				{ max: 100, durationMs: 60_000 },
			]),
		);
		expect(r).toEqual({ max: 100, duration: 60_000 });
	});
});
