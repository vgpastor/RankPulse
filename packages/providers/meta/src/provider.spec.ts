import { describe, expect, it } from 'vitest';
import { extractAdsInsightRows } from './acl/ads-insights-to-rows.acl.js';
import { extractPixelEventRows } from './acl/pixel-events-to-rows.acl.js';
import { MetaProvider } from './provider.js';

const validToken = 'EAABwzLixnjYBA1234567890abcdefghijklmnopqr_-XYZ';

describe('MetaProvider', () => {
	it('exposes the three Meta endpoints via discover()', () => {
		const ids = new MetaProvider().discover().map((e) => e.id);
		expect(ids).toEqual(['meta-pixel-events-stats', 'meta-ads-insights', 'meta-custom-audiences']);
	});

	it('validateCredentialPlaintext accepts a normal long-lived access token', () => {
		expect(() => new MetaProvider().validateCredentialPlaintext(validToken)).not.toThrow();
	});

	it('validateCredentialPlaintext rejects empty / too-short / pure-symbol tokens', () => {
		expect(() => new MetaProvider().validateCredentialPlaintext('')).toThrow();
		expect(() => new MetaProvider().validateCredentialPlaintext('too-short')).toThrow();
		// 42 dashes — passes the length+charset gate but has no alphanumerics.
		expect(() => new MetaProvider().validateCredentialPlaintext('-'.repeat(42))).toThrow();
	});

	it('pixel-events-stats schema rejects a non-numeric pixelId', () => {
		const ep = new MetaProvider().discover().find((e) => e.id === 'meta-pixel-events-stats');
		expect(
			ep?.paramsSchema.safeParse({
				pixelId: 'bad',
				startDate: '2025-01-01',
				endDate: '2025-01-02',
			}).success,
		).toBe(false);
	});

	it('ads-insights schema accepts both bare and act_ form ad-account ids', () => {
		const ep = new MetaProvider().discover().find((e) => e.id === 'meta-ads-insights');
		expect(
			ep?.paramsSchema.safeParse({
				adAccountId: '12345',
				startDate: '2025-01-01',
				endDate: '2025-01-02',
			}).success,
		).toBe(true);
		expect(
			ep?.paramsSchema.safeParse({
				adAccountId: 'act_12345',
				startDate: '2025-01-01',
				endDate: '2025-01-02',
			}).success,
		).toBe(true);
	});

	it('fetch rejects an unknown endpoint id', async () => {
		const provider = new MetaProvider();
		await expect(
			provider.fetch('not-real', {}, {
				credential: { plaintextSecret: validToken },
				signal: new AbortController().signal,
			} as never),
		).rejects.toThrow();
	});
});

describe('extractPixelEventRows', () => {
	it('flattens daily buckets to one row per (day, event_name)', () => {
		const rows = extractPixelEventRows(
			{
				data: [
					{
						start_time: '2025-01-01T00:00:00-0800',
						data: [
							{ event: 'PageView', count: 1234, value: 0 },
							{ event: 'Purchase', count: 5, value: 234.5 },
						],
					},
					{
						start_time: '2025-01-02T00:00:00-0800',
						data: [{ event: 'PageView', count: 1500, value: 0 }],
					},
				],
			},
			'2025-01-01',
		);
		expect(rows).toEqual([
			{ observedDate: '2025-01-01', eventName: 'PageView', count: 1234, valueSum: 0 },
			{ observedDate: '2025-01-01', eventName: 'Purchase', count: 5, valueSum: 234.5 },
			{ observedDate: '2025-01-02', eventName: 'PageView', count: 1500, valueSum: 0 },
		]);
	});

	it('drops rows with empty event name', () => {
		const rows = extractPixelEventRows(
			{
				data: [
					{
						start_time: '2025-01-01T00:00:00Z',
						data: [
							{ event: '', count: 1 },
							{ event: 'X', count: 2 },
						],
					},
				],
			},
			'2025-01-01',
		);
		expect(rows.map((r) => r.eventName)).toEqual(['X']);
	});

	it('falls back to provided date when start_time is malformed', () => {
		const rows = extractPixelEventRows(
			{ data: [{ start_time: undefined, data: [{ event: 'PageView', count: 1 }] }] },
			'2025-02-15',
		);
		expect(rows[0]?.observedDate).toBe('2025-02-15');
	});

	it('passes through negative valueSum (refund / chargeback events)', () => {
		const rows = extractPixelEventRows(
			{
				data: [
					{
						start_time: '2025-01-01T00:00:00Z',
						data: [{ event: 'Purchase', count: 1, value: -49.99 }],
					},
				],
			},
			'2025-01-01',
		);
		expect(rows[0]?.valueSum).toBe(-49.99);
	});
});

describe('extractAdsInsightRows', () => {
	it('extracts campaign-level rows and sums conversion-shaped actions', () => {
		const rows = extractAdsInsightRows(
			{
				data: [
					{
						date_start: '2025-01-01',
						date_stop: '2025-01-01',
						campaign_id: '111',
						campaign_name: 'Spring Sale',
						impressions: '10000',
						clicks: '250',
						spend: '45.67',
						actions: [
							{ action_type: 'purchase', value: '5' },
							{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' },
							{ action_type: 'video_view', value: '2000' },
						],
					},
				],
			},
			'campaign',
			'2025-01-01',
		);
		expect(rows).toEqual([
			{
				observedDate: '2025-01-01',
				level: 'campaign',
				entityId: '111',
				entityName: 'Spring Sale',
				impressions: 10000,
				clicks: 250,
				spend: 45.67,
				conversions: 8,
			},
		]);
	});

	it('skips rows that lack the requested level entity id', () => {
		const rows = extractAdsInsightRows(
			{
				data: [
					{
						date_start: '2025-01-01',
						campaign_id: '111',
						campaign_name: 'X',
						impressions: '1',
						clicks: '0',
						spend: '0',
					},
					{ date_start: '2025-01-01', impressions: '1' }, // no level id, drop
				],
			},
			'campaign',
			'2025-01-01',
		);
		expect(rows).toHaveLength(1);
	});
});
