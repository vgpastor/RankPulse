import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { DATE_OR_TOKEN_REGEX } from '@rankpulse/shared';
import { z } from 'zod';
import type { BrevoHttp } from '../http.js';

/**
 * `GET /conversations/messages` — Brevo Conversations doesn't expose a
 * pre-aggregated daily stats endpoint, so we list messages over the
 * window and aggregate them in the ACL. Brevo paginates with
 * `startingAfter`+`limit`; we use the maximum 50/page and let the worker
 * chain pages until exhausted (BACKLOG worker pagination is centralized,
 * we just expose a `limit` and `startingAfter` here).
 *
 * `dateFrom`/`dateTo` are millisecond unix timestamps; we accept ISO
 * dates or the `{{today-N}}` tokens (resolved by the worker before
 * dispatch — see BACKLOG #22) and convert at fetch time.
 */
export const ConversationStatsParams = z.object({
	dateFrom: z.string().regex(DATE_OR_TOKEN_REGEX),
	dateTo: z.string().regex(DATE_OR_TOKEN_REGEX),
	limit: z.number().int().min(1).max(50).default(50),
	startingAfter: z.string().min(1).optional(),
});
export type ConversationStatsParams = z.infer<typeof ConversationStatsParams>;

export const conversationStatsDescriptor: EndpointDescriptor = {
	id: 'brevo-conversation-stats',
	category: 'traffic',
	displayName: 'Brevo — chat conversation stats',
	description:
		'Lists conversation widget messages in the window and aggregates them daily (started, completed, avg duration). Use only when the Brevo conversations widget is active on the site.',
	paramsSchema: ConversationStatsParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '15 6 * * *',
	rateLimit: { max: 60, durationMs: 60_000 },
};

export interface ConversationMessageItem {
	id: string;
	conversationId?: string;
	type?: string;
	createdAt?: number;
	updatedAt?: number;
	text?: string;
	visitorId?: string;
	agentId?: string;
	isVisitorMessage?: boolean;
	endedAt?: number;
	startedAt?: number;
}

export interface ConversationStatsResponse {
	messages?: ConversationMessageItem[];
	hasMore?: boolean;
	nextStartingAfter?: string;
}

const toUnixMs = (yyyyMmDd: string, endOfDay: boolean): string => {
	// Brevo expects unix ms; we treat dateFrom as 00:00 UTC, dateTo as 23:59:59 UTC
	// so a single day window includes the entire calendar day in UTC.
	const [y, m, d] = yyyyMmDd.split('-').map(Number) as [number, number, number];
	const t = endOfDay ? Date.UTC(y, m - 1, d, 23, 59, 59, 999) : Date.UTC(y, m - 1, d, 0, 0, 0, 0);
	return String(t);
};

export const fetchConversationStats = async (
	http: BrevoHttp,
	params: ConversationStatsParams,
	ctx: FetchContext,
): Promise<ConversationStatsResponse> => {
	const query: Record<string, string | undefined> = {
		dateFrom: toUnixMs(params.dateFrom, false),
		dateTo: toUnixMs(params.dateTo, true),
		limit: String(params.limit),
		startingAfter: params.startingAfter,
	};
	const raw = (await http.get(
		'/conversations/messages',
		query,
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as ConversationStatsResponse;
	return raw ?? { messages: [] };
};
