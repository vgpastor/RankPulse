import { describe, expect, it } from 'vitest';
import type { EmailStatisticsResponse } from '../endpoints/email-statistics.js';
import { extractEmailEngagement } from './email-stats-to-engagement.acl.js';

const FALLBACK = new Date('2026-05-04T12:00:00Z');

describe('extractEmailEngagement (Brevo aggregated email stats)', () => {
	it('maps every documented field and sums hard+soft bounces', () => {
		const response: EmailStatisticsResponse = {
			requests: 1000,
			delivered: 950,
			hardBounces: 20,
			softBounces: 30,
			clicks: 200,
			uniqueClicks: 180,
			opens: 600,
			uniqueOpens: 500,
			spamReports: 3,
			blocked: 5,
			invalid: 2,
			unsubscribed: 10,
		};
		const row = extractEmailEngagement(
			response,
			{ startDate: '2026-05-01', endDate: '2026-05-04' },
			FALLBACK,
		);
		expect(row).toEqual({
			day: '2026-05-04',
			sent: 1000,
			delivered: 950,
			opened: 600,
			uniqueOpened: 500,
			clicked: 200,
			uniqueClicked: 180,
			bounced: 50,
			unsubscribed: 10,
			complaints: 3,
			blocked: 5,
			invalid: 2,
		});
	});

	it('falls back to today when params use the rolling-window form', () => {
		const row = extractEmailEngagement({}, { days: 7 }, FALLBACK);
		expect(row.day).toBe('2026-05-04');
	});

	it('coerces missing / negative / NaN counters to 0 instead of throwing', () => {
		const response: EmailStatisticsResponse = {
			requests: -5,
			delivered: Number.NaN,
			hardBounces: undefined,
			opens: 600,
		};
		const row = extractEmailEngagement(response, { endDate: '2026-05-04' }, FALLBACK);
		expect(row.sent).toBe(0);
		expect(row.delivered).toBe(0);
		expect(row.bounced).toBe(0);
		expect(row.opened).toBe(600);
	});

	it('truncates non-integer counters (Brevo occasionally returns floats for partial-window aggregates)', () => {
		const row = extractEmailEngagement(
			{ requests: 1234.9, delivered: 999.1 },
			{ endDate: '2026-05-04' },
			FALLBACK,
		);
		expect(row.sent).toBe(1234);
		expect(row.delivered).toBe(999);
	});
});
