import { type ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import type { DrizzleDatabase } from '../../client.js';
import {
	DrizzleGscPerformanceObservationRepository,
	GSC_INSERT_BATCH_ROWS,
} from './gsc-performance-observation.repository.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const PROPERTY_ID = '22222222-2222-2222-2222-222222222222' as Uuid as SearchConsoleInsights.GscPropertyId;

const observation = (n: number): SearchConsoleInsights.GscPerformanceObservation =>
	SearchConsoleInsights.GscPerformanceObservation.record({
		id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}` as Uuid as SearchConsoleInsights.GscObservationId,
		gscPropertyId: PROPERTY_ID,
		projectId: PROJECT_ID,
		observedAt: new Date('2026-09-14T00:00:00Z'),
		query: `query ${n}`,
		page: 'https://patroltech.online/',
		country: 'esp',
		device: null,
		metrics: { clicks: 0, impressions: 1, ctr: 0, position: 4 },
		rawPayloadId: null,
	});

/**
 * Records the row count of every INSERT the repository issues and answers each
 * one as if every row landed, so `inserted` can be checked against the input.
 */
const dbCountingInserts = () => {
	const batches: number[] = [];
	const returning = vi.fn(async () => Array.from({ length: batches.at(-1) ?? 0 }, () => ({ id: 1 })));
	const onConflictDoNothing = vi.fn(() => ({ returning }));
	const values = vi.fn((rows: unknown[]) => {
		batches.push(rows.length);
		return { onConflictDoNothing };
	});
	const insert = vi.fn(() => ({ values }));
	return { db: { insert } as unknown as DrizzleDatabase, batches };
};

describe('DrizzleGscPerformanceObservationRepository.saveAll', () => {
	it('issues no statement for an empty input', async () => {
		const { db, batches } = dbCountingInserts();
		const result = await new DrizzleGscPerformanceObservationRepository(db).saveAll([]);
		expect(result).toEqual({ inserted: 0 });
		expect(batches).toEqual([]);
	});

	it('sends a small set in a single statement', async () => {
		const { db, batches } = dbCountingInserts();
		const rows = Array.from({ length: 497 }, (_, i) => observation(i));
		const result = await new DrizzleGscPerformanceObservationRepository(db).saveAll(rows);
		expect(batches).toEqual([497]);
		expect(result.inserted).toBe(497);
	});

	// patroltech.online's window came back as 5 773 rows: twelve bind
	// parameters each, 69 276 in one statement, over Postgres's 65 535 cap.
	// The property had not persisted a single observation since 2026-07-08.
	it('splits a window larger than one statement can carry', async () => {
		const { db, batches } = dbCountingInserts();
		const rows = Array.from({ length: 5_773 }, (_, i) => observation(i));
		const result = await new DrizzleGscPerformanceObservationRepository(db).saveAll(rows);

		expect(batches.length).toBe(Math.ceil(5_773 / GSC_INSERT_BATCH_ROWS));
		expect(Math.max(...batches)).toBeLessThanOrEqual(GSC_INSERT_BATCH_ROWS);
		expect(batches.reduce((a, b) => a + b, 0)).toBe(5_773);
		expect(result.inserted).toBe(5_773);
	});

	it('keeps every batch under the Postgres bind-parameter limit', () => {
		const COLUMNS_PER_ROW = 12;
		const POSTGRES_MAX_BIND_PARAMETERS = 65_535;
		expect(GSC_INSERT_BATCH_ROWS * COLUMNS_PER_ROW).toBeLessThan(POSTGRES_MAX_BIND_PARAMETERS);
	});
});
