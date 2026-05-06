import { describe, expect, it } from 'vitest';
import type { ConversationStatsResponse } from '../endpoints/conversation-stats.js';
import { extractConversationsDaily } from './conversations-to-daily.acl.js';

const day1Start = Date.UTC(2026, 4, 4, 9, 0, 0); // 2026-05-04 09:00 UTC
const day1End = Date.UTC(2026, 4, 4, 9, 5, 0); // 5min later

const day2Start = Date.UTC(2026, 4, 5, 14, 0, 0); // 2026-05-05 14:00
const day2End = Date.UTC(2026, 4, 5, 14, 8, 30); // 8m30s later

describe('extractConversationsDaily (Brevo conversations messages)', () => {
	it('aggregates a finished conversation into started+completed and computes avg duration on the END day', () => {
		const page: ConversationStatsResponse = {
			messages: [
				{ id: 'm1', conversationId: 'c1', startedAt: day1Start, createdAt: day1Start },
				{ id: 'm2', conversationId: 'c1', endedAt: day1End },
			],
		};
		const rows = extractConversationsDaily([page]);
		expect(rows).toEqual([{ day: '2026-05-04', started: 1, completed: 1, avgDurationSeconds: 300 }]);
	});

	it('counts open conversations toward started but not completed and emits avgDuration null on a started-only day', () => {
		const page: ConversationStatsResponse = {
			messages: [{ id: 'm1', conversationId: 'c1', createdAt: day1Start }],
		};
		const rows = extractConversationsDaily([page]);
		expect(rows).toEqual([{ day: '2026-05-04', started: 1, completed: 0, avgDurationSeconds: null }]);
	});

	it('buckets started vs completed on the days they actually occurred (cross-day conversation)', () => {
		const page: ConversationStatsResponse = {
			messages: [
				// started on day1, ends on day2
				{ id: 'm1', conversationId: 'c1', startedAt: day1Start, createdAt: day1Start },
				{ id: 'm2', conversationId: 'c1', endedAt: day2End },
			],
		};
		const rows = extractConversationsDaily([page]);
		// One row per day: 2026-05-04 = started; 2026-05-05 = completed
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual({
			day: '2026-05-04',
			started: 1,
			completed: 0,
			avgDurationSeconds: null,
		});
		expect(rows[1]?.day).toBe('2026-05-05');
		expect(rows[1]?.started).toBe(0);
		expect(rows[1]?.completed).toBe(1);
		expect(rows[1]?.avgDurationSeconds).toBeGreaterThan(0);
	});

	it('folds messages from the same conversation across pages without double-counting', () => {
		const page1: ConversationStatsResponse = {
			messages: [{ id: 'm1', conversationId: 'c1', createdAt: day1Start }],
		};
		const page2: ConversationStatsResponse = {
			messages: [{ id: 'm2', conversationId: 'c1', endedAt: day1End }],
		};
		const rows = extractConversationsDaily([page1, page2]);
		expect(rows).toEqual([{ day: '2026-05-04', started: 1, completed: 1, avgDurationSeconds: 300 }]);
	});

	it('averages multiple completed conversations on the same day', () => {
		// Two convos ending on day2: 4min and 8min — avg = 6min (360s)
		const fourMin = Date.UTC(2026, 4, 5, 14, 4, 0);
		const eightMin = Date.UTC(2026, 4, 5, 14, 8, 0);
		const page: ConversationStatsResponse = {
			messages: [
				{ id: 'a1', conversationId: 'cA', createdAt: day2Start },
				{ id: 'a2', conversationId: 'cA', endedAt: fourMin },
				{ id: 'b1', conversationId: 'cB', createdAt: day2Start },
				{ id: 'b2', conversationId: 'cB', endedAt: eightMin },
			],
		};
		const rows = extractConversationsDaily([page]);
		expect(rows).toEqual([{ day: '2026-05-05', started: 2, completed: 2, avgDurationSeconds: 360 }]);
	});

	it('drops messages with no conversation id and no message id', () => {
		const page: ConversationStatsResponse = {
			messages: [{ id: '' as unknown as string, createdAt: day1Start }],
		};
		const rows = extractConversationsDaily([page]);
		expect(rows).toEqual([]);
	});
});
