import type { ConversationMessageItem, ConversationStatsResponse } from '../endpoints/conversation-stats.js';

/**
 * Domain-shaped row for the `chat_conversations_daily` hypertable. One row
 * per (project, day). Avg duration is null when no conversation completed
 * on that day — we never persist `0` for "no signal", because zero is also
 * a legitimate value (instant abandon) and we don't want the read side to
 * confuse the two.
 */
export interface BrevoChatConversationsRow {
	day: string; // YYYY-MM-DD
	started: number;
	completed: number;
	avgDurationSeconds: number | null;
}

const dayOfMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

interface ConversationFolding {
	startedAt: number | null;
	endedAt: number | null;
}

/**
 * Pure ACL: a page (or the union of pages) of `/conversations/messages`
 * payload → daily-aggregated rows. We fold messages into per-conversation
 * spans (earliest `startedAt` / latest `endedAt`) and then bucket by the
 * UTC day of the start.
 *
 * Brevo's message stream interleaves visitor and agent messages; a
 * conversation is "started" the moment the FIRST message lands and
 * "completed" only when an `endedAt` is observed. Open conversations
 * (no `endedAt`) count toward `started` but not `completed`.
 */
export const extractConversationsDaily = (
	pages: readonly ConversationStatsResponse[],
): readonly BrevoChatConversationsRow[] => {
	const byConvo = new Map<string, ConversationFolding>();
	for (const page of pages) {
		for (const msg of page.messages ?? []) {
			fold(byConvo, msg);
		}
	}

	const startedByDay = new Map<string, number>();
	const endedByDay = new Map<string, number>();
	const durationsByDay = new Map<string, number[]>();

	for (const span of byConvo.values()) {
		if (span.startedAt === null) continue;
		const startDay = dayOfMs(span.startedAt);
		startedByDay.set(startDay, (startedByDay.get(startDay) ?? 0) + 1);
		if (span.endedAt !== null && span.endedAt >= span.startedAt) {
			const endDay = dayOfMs(span.endedAt);
			endedByDay.set(endDay, (endedByDay.get(endDay) ?? 0) + 1);
			const durationSec = Math.round((span.endedAt - span.startedAt) / 1000);
			const list = durationsByDay.get(endDay) ?? [];
			list.push(durationSec);
			durationsByDay.set(endDay, list);
		}
	}

	const days = new Set<string>([...startedByDay.keys(), ...endedByDay.keys()]);
	const sortedDays = [...days].sort();
	return sortedDays.map((day) => {
		const completed = endedByDay.get(day) ?? 0;
		const durations = durationsByDay.get(day) ?? [];
		const avgDurationSeconds =
			durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
		return {
			day,
			started: startedByDay.get(day) ?? 0,
			completed,
			avgDurationSeconds,
		};
	});
};

const fold = (acc: Map<string, ConversationFolding>, msg: ConversationMessageItem): void => {
	const convoId = msg.conversationId ?? msg.id;
	if (typeof convoId !== 'string' || convoId.length === 0) return;
	// Brevo timestamps are unix-ms numbers; we accept either `startedAt`/`endedAt`
	// (when present) or fall back to `createdAt` for the start and `updatedAt`
	// for the end. Anything not a finite positive number is dropped.
	const start =
		brevoTimestamp(msg.startedAt) ?? brevoTimestamp(msg.createdAt) ?? brevoTimestamp(msg.updatedAt);
	const end = brevoTimestamp(msg.endedAt);
	const prev = acc.get(convoId);
	if (!prev) {
		acc.set(convoId, { startedAt: start, endedAt: end });
		return;
	}
	acc.set(convoId, {
		startedAt: minOrEither(prev.startedAt, start),
		endedAt: maxOrEither(prev.endedAt, end),
	});
};

const minOrEither = (a: number | null, b: number | null): number | null => {
	if (a === null) return b;
	if (b === null) return a;
	return Math.min(a, b);
};

const maxOrEither = (a: number | null, b: number | null): number | null => {
	if (a === null) return b;
	if (b === null) return a;
	return Math.max(a, b);
};

// Brevo timestamps are unix milliseconds and always > 0; treat zero / non-finite
// as "absent" so the folder above can collapse missing fields cleanly.
const brevoTimestamp = (v: number | undefined): number | null => {
	if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
	return v;
};
