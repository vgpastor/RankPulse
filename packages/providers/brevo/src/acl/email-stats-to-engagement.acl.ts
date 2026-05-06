import type { EmailStatisticsParams, EmailStatisticsResponse } from '../endpoints/email-statistics.js';
import { toNonNegInt } from './coercion.js';

/**
 * Domain-shaped row for the `email_engagement_daily` hypertable. One row per
 * (project, day) — the hypertable's natural key. We keep `complaints` as a
 * dedicated column because Brevo splits "spamReports" (recipient hit the
 * "this is spam" button) from "blocked" (server-side block) and we want both
 * preserved without a generic catch-all bag.
 */
export interface BrevoEmailEngagementRow {
	day: string; // YYYY-MM-DD
	sent: number;
	delivered: number;
	opened: number;
	uniqueOpened: number;
	clicked: number;
	uniqueClicked: number;
	bounced: number; // hardBounces + softBounces
	unsubscribed: number;
	complaints: number; // spamReports
	blocked: number;
	invalid: number;
}

/**
 * Pure ACL: aggregated `/smtp/statistics/aggregatedReport` payload → one
 * `BrevoEmailEngagementRow`. The endpoint returns a single aggregate over the
 * requested window; we tag the row with the END date of the window because
 * that's the day on which the data was final (Brevo's stats are computed
 * end-of-day in UTC).
 */
export const extractEmailEngagement = (
	response: EmailStatisticsResponse,
	params: Pick<EmailStatisticsParams, 'startDate' | 'endDate' | 'days'>,
	fallbackToday: Date,
): BrevoEmailEngagementRow => {
	const day = pickDay(params, fallbackToday);
	const hardBounces = toNonNegInt(response.hardBounces);
	const softBounces = toNonNegInt(response.softBounces);
	return {
		day,
		sent: toNonNegInt(response.requests),
		delivered: toNonNegInt(response.delivered),
		opened: toNonNegInt(response.opens),
		uniqueOpened: toNonNegInt(response.uniqueOpens),
		clicked: toNonNegInt(response.clicks),
		uniqueClicked: toNonNegInt(response.uniqueClicks),
		bounced: hardBounces + softBounces,
		unsubscribed: toNonNegInt(response.unsubscribed),
		complaints: toNonNegInt(response.spamReports),
		blocked: toNonNegInt(response.blocked),
		invalid: toNonNegInt(response.invalid),
	};
};

const pickDay = (
	params: Pick<EmailStatisticsParams, 'startDate' | 'endDate' | 'days'>,
	fallbackToday: Date,
): string => {
	if (params.endDate && /^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) return params.endDate;
	// `days=N` means "rolling N days ending today"; tag with today.
	return fallbackToday.toISOString().slice(0, 10);
};
