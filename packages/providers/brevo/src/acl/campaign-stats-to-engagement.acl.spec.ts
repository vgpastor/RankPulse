import { describe, expect, it } from 'vitest';
import type { CampaignStatisticsResponse } from '../endpoints/campaign-statistics.js';
import { extractCampaignEngagement } from './campaign-stats-to-engagement.acl.js';

describe('extractCampaignEngagement (Brevo campaign stats)', () => {
	it('maps the globalStats block, sums bounces, and tags the row with the observed date', () => {
		const response: CampaignStatisticsResponse = {
			id: 17,
			statistics: {
				globalStats: {
					sent: 5000,
					delivered: 4900,
					viewed: 2000,
					uniqueViews: 1500,
					clickers: 400,
					uniqueClicks: 350,
					hardBounces: 50,
					softBounces: 50,
					unsubscriptions: 12,
					complaints: 4,
				},
			},
		};
		expect(extractCampaignEngagement(response, '2026-05-04')).toEqual({
			day: '2026-05-04',
			sent: 5000,
			delivered: 4900,
			opened: 2000,
			uniqueOpened: 1500,
			clicked: 400,
			uniqueClicked: 350,
			bounced: 100,
			unsubscribed: 12,
			complaints: 4,
			blocked: 0,
			invalid: 0,
		});
	});

	it('returns an all-zero row when globalStats is absent (campaign has not been sent yet)', () => {
		const row = extractCampaignEngagement({}, '2026-05-04');
		expect(row.sent).toBe(0);
		expect(row.delivered).toBe(0);
		expect(row.day).toBe('2026-05-04');
	});
});
