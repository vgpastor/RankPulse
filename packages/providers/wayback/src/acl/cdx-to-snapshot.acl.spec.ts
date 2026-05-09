import { describe, expect, it } from 'vitest';
import type { CdxResponse } from '../endpoints/cdx-snapshots.js';
import { summariseCdxResponse } from './cdx-to-snapshot.acl.js';

describe('summariseCdxResponse', () => {
	it('returns zero counts when response is empty', () => {
		expect(summariseCdxResponse([])).toEqual({
			snapshotCount: 0,
			latestSnapshotAt: null,
			earliestSnapshotAt: null,
			statusCodeBreakdown: {},
		});
	});

	it('strips the header row and counts data rows', () => {
		const raw: CdxResponse = [
			['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
			['com,example)/', '20260301120000', 'https://example.com/', 'text/html', '200', 'a', '4321'],
			['com,example)/', '20260315120000', 'https://example.com/', 'text/html', '200', 'b', '4500'],
			['com,example)/', '20260320120000', 'https://example.com/', 'text/html', '301', 'c', '0'],
		];
		const summary = summariseCdxResponse(raw);
		expect(summary.snapshotCount).toBe(3);
		expect(summary.latestSnapshotAt).toBe('2026-03-20T12:00:00.000Z');
		expect(summary.earliestSnapshotAt).toBe('2026-03-01T12:00:00.000Z');
		expect(summary.statusCodeBreakdown).toEqual({ '200': 2, '301': 1 });
	});

	it('handles a response that has no header row (defensive)', () => {
		const raw: CdxResponse = [
			['com,example)/', '20260301120000', 'https://example.com/', 'text/html', '200', 'a', '4321'],
		];
		const summary = summariseCdxResponse(raw);
		expect(summary.snapshotCount).toBe(1);
	});

	it('skips rows with malformed timestamps when picking latest/earliest', () => {
		const raw: CdxResponse = [
			['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
			['com,example)/', 'malformed', 'https://example.com/', 'text/html', '200', 'a', '4321'],
			['com,example)/', '20260315120000', 'https://example.com/', 'text/html', '200', 'b', '4500'],
		];
		const summary = summariseCdxResponse(raw);
		expect(summary.snapshotCount).toBe(2);
		expect(summary.latestSnapshotAt).toBe('2026-03-15T12:00:00.000Z');
	});
});
