import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { DATE_OR_TOKEN_REGEX } from '@rankpulse/shared';
import { z } from 'zod';
import type { BrevoHttp } from '../http.js';

/**
 * `GET /smtp/statistics/aggregatedReport` — global transactional + marketing
 * email aggregates over a date window. Brevo bills in days; the natural
 * granularity is daily so we run the cron daily and ask for the prior day's
 * window when the operator wants per-day rows (set `days=1`), or for a
 * rolling N-day window when the operator wants a cumulative report.
 *
 * The endpoint accepts EITHER `startDate`/`endDate` (ISO yyyy-mm-dd or the
 * relative `{{today-N}}` tokens that the worker resolves at fetch time —
 * see BACKLOG #22) OR `days` (rolling window from today).
 *
 * Free tier: 300 emails/day on the email plan; the API itself has no
 * per-call cost. We pin `cost.amount = 0`.
 */
export const EmailStatisticsParams = z
	.object({
		startDate: z.string().regex(DATE_OR_TOKEN_REGEX).optional(),
		endDate: z.string().regex(DATE_OR_TOKEN_REGEX).optional(),
		days: z.number().int().min(1).max(90).optional(),
		tag: z.string().min(1).max(64).optional(),
	})
	.refine(
		(v) => (v.startDate && v.endDate) || typeof v.days === 'number',
		'either { startDate, endDate } or { days } must be provided',
	);
export type EmailStatisticsParams = z.infer<typeof EmailStatisticsParams>;

export const emailStatisticsDescriptor: EndpointDescriptor = {
	id: 'brevo-email-statistics',
	category: 'traffic',
	displayName: 'Brevo — email statistics (aggregated)',
	description:
		'Aggregated transactional + marketing email metrics (sent, delivered, opens, clicks, bounces, unsubscribes, complaints) over a date window. Daily cron feeds the email_engagement_daily hypertable.',
	paramsSchema: EmailStatisticsParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '0 6 * * *',
	rateLimit: { max: 60, durationMs: 60_000 },
};

/**
 * The aggregated payload Brevo returns. Brevo's docs guarantee these keys
 * even when their value is zero; we still default-coerce in the ACL because
 * partner APIs occasionally drop empty fields and we don't want a single
 * missing key to abort a daily ingest.
 */
export interface EmailStatisticsResponse {
	requests?: number;
	delivered?: number;
	hardBounces?: number;
	softBounces?: number;
	clicks?: number;
	uniqueClicks?: number;
	opens?: number;
	uniqueOpens?: number;
	spamReports?: number;
	blocked?: number;
	invalid?: number;
	unsubscribed?: number;
	range?: string;
}

export const fetchEmailStatistics = async (
	http: BrevoHttp,
	params: EmailStatisticsParams,
	ctx: FetchContext,
): Promise<EmailStatisticsResponse> => {
	const query: Record<string, string | undefined> = {
		startDate: params.startDate,
		endDate: params.endDate,
		days: params.days !== undefined ? String(params.days) : undefined,
		tag: params.tag,
	};
	const raw = (await http.get(
		'/smtp/statistics/aggregatedReport',
		query,
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as EmailStatisticsResponse;
	return raw ?? {};
};
