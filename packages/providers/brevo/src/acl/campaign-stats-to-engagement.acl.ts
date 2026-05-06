import type { CampaignStatisticsResponse } from '../endpoints/campaign-statistics.js';
import { toNonNegInt } from './coercion.js';
import type { BrevoEmailEngagementRow } from './email-stats-to-engagement.acl.js';

/**
 * Pure ACL: campaign payload → an `BrevoEmailEngagementRow` keyed by the
 * day the cron observed. Campaigns are cumulative aggregates (Brevo gives us
 * "totals since send"), so we reuse the same row shape and let the read side
 * decide whether to plot `delta(today, yesterday)` or the cumulative curve.
 */
export const extractCampaignEngagement = (
	response: CampaignStatisticsResponse,
	observedDate: string,
): BrevoEmailEngagementRow => {
	const g = response.statistics?.globalStats ?? {};
	const hardBounces = toNonNegInt(g.hardBounces);
	const softBounces = toNonNegInt(g.softBounces);
	return {
		day: observedDate,
		sent: toNonNegInt(g.sent),
		delivered: toNonNegInt(g.delivered),
		opened: toNonNegInt(g.viewed),
		uniqueOpened: toNonNegInt(g.uniqueViews),
		clicked: toNonNegInt(g.clickers),
		uniqueClicked: toNonNegInt(g.uniqueClicks),
		bounced: hardBounces + softBounces,
		unsubscribed: toNonNegInt(g.unsubscriptions),
		complaints: toNonNegInt(g.complaints),
		blocked: 0,
		invalid: 0,
	};
};
