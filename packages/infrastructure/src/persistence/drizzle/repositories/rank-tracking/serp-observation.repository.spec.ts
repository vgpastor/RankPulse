import type { ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import type { DrizzleDatabase } from '../../client.js';
import { DrizzleSerpObservationRepository } from './serp-observation.repository.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;

const stubDbReturning = (rows: unknown[]): DrizzleDatabase => {
	const execute = vi.fn().mockResolvedValue(rows);
	return { execute } as unknown as DrizzleDatabase;
};

describe('DrizzleSerpObservationRepository.listLatestForProject', () => {
	// postgres-js (3.4.x) returns timestamptz as ISO strings — not Date —
	// for raw `db.execute()` queries. `QuerySerpMapUseCase` calls
	// `.toISOString()` on `observedAt` (line 90), AND `rehydrate` builds
	// the SerpObservationId from `observedAt.toISOString()`. The repo MUST
	// coerce string → Date. Regression guard for issue #182 (500 INTERNAL
	// on /serp-map).
	const baseRow = (overrides: Partial<Record<string, unknown>>): Record<string, unknown> => ({
		observed_at: '2026-05-09 00:00:00+00',
		project_id: PROJECT_ID,
		phrase: 'control de rondas',
		country: 'ES',
		language: 'es',
		device: 'desktop',
		rank: 1,
		domain: 'patroltech.online',
		url: 'https://patroltech.online/es/',
		title: 'PatrolTech',
		source_provider: 'dataforseo',
		raw_payload_id: null,
		...overrides,
	});

	it('coerces string observed_at columns to Date in rehydrated observations', async () => {
		const db = stubDbReturning([baseRow({ rank: 1 }), baseRow({ rank: 2, domain: 'competitor.com' })]);
		const repo = new DrizzleSerpObservationRepository(db);
		const out = await repo.listLatestForProject(PROJECT_ID, 7);
		expect(out).toHaveLength(1);
		const obs = out[0];
		expect(obs?.observedAt).toBeInstanceOf(Date);
		expect(obs?.observedAt.toISOString()).toBe('2026-05-09T00:00:00.000Z');
		expect(obs?.results).toHaveLength(2);
	});

	it('passes Date instances through unchanged', async () => {
		const date = new Date('2026-05-09T00:00:00.000Z');
		const db = stubDbReturning([baseRow({ observed_at: date })]);
		const repo = new DrizzleSerpObservationRepository(db);
		const [obs] = await repo.listLatestForProject(PROJECT_ID, 7);
		expect(obs?.observedAt).toBe(date);
	});

	it('throws InvalidInputError for invalid device value', async () => {
		const db = stubDbReturning([baseRow({ device: 'tablet' })]);
		const repo = new DrizzleSerpObservationRepository(db);
		await expect(repo.listLatestForProject(PROJECT_ID, 7)).rejects.toThrow(/invalid device/);
	});

	it('returns empty array when query has no rows', async () => {
		const db = stubDbReturning([]);
		const repo = new DrizzleSerpObservationRepository(db);
		const out = await repo.listLatestForProject(PROJECT_ID, 7);
		expect(out).toEqual([]);
	});
});
