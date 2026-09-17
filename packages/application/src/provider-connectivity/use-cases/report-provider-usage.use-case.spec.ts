import type { ProviderConnectivity } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import { ReportProviderUsageUseCase } from './report-provider-usage.use-case.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const FROM = new Date('2026-09-01T00:00:00Z');
const TO = new Date('2026-09-18T00:00:00Z');

const build = (
	rows: ProviderConnectivity.UsageBreakdownRow[],
	counts: ProviderConnectivity.RunExecutionCounts,
) => {
	const usage = {
		save: async () => {},
		sumCostCents: async () => 0,
		breakdown: async () => rows,
	} satisfies ProviderConnectivity.ApiUsageRepository;
	const runs = {
		save: async () => {},
		countExecutions: async () => counts,
		findById: async () => null,
		listForDefinition: async () => [],
	} satisfies ProviderConnectivity.JobRunRepository;
	return new ReportProviderUsageUseCase(usage, runs);
};

const ROWS: ProviderConnectivity.UsageBreakdownRow[] = [
	{ key: 'dataforseo', providerId: 'dataforseo', calls: 290, costCents: 1_102.5 },
	{ key: 'openai', providerId: 'openai', calls: 336, costCents: 1_176 },
];

describe('ReportProviderUsageUseCase', () => {
	it('totals the grouped rows so header and table agree', async () => {
		const view = await build(ROWS, { billed: 626, fromCache: 0 }).execute({
			organizationId: ORG,
			from: FROM,
			to: TO,
		});

		expect(view.totalCostCents).toBe(2_278.5);
		expect(view.billedCalls).toBe(626);
		expect(view.rows).toHaveLength(2);
	});

	it('expresses the share of runs that avoided an upstream call', async () => {
		// 132 of 422 runs replayed a payload — the shape #214 produces.
		const view = await build(ROWS, { billed: 290, fromCache: 132 }).execute({
			organizationId: ORG,
			from: FROM,
			to: TO,
		});

		expect(view.cachedRuns).toBe(132);
		expect(view.cacheHitRatio).toBeCloseTo(132 / 422, 5);
	});

	it('reports no ratio when nothing ran, rather than zero', async () => {
		// An idle window is missing data, not a 0% hit rate.
		const view = await build([], { billed: 0, fromCache: 0 }).execute({
			organizationId: ORG,
			from: FROM,
			to: TO,
		});

		expect(view.cacheHitRatio).toBeNull();
		expect(view.totalCostCents).toBe(0);
	});

	it('defaults to grouping by provider', async () => {
		const view = await build(ROWS, { billed: 1, fromCache: 0 }).execute({
			organizationId: ORG,
			from: FROM,
			to: TO,
		});

		expect(view.groupBy).toBe('provider');
	});

	it('passes the requested grouping through', async () => {
		const view = await build(ROWS, { billed: 1, fromCache: 0 }).execute({
			organizationId: ORG,
			from: FROM,
			to: TO,
			groupBy: 'endpoint',
		});

		expect(view.groupBy).toBe('endpoint');
	});

	it('rejects an inverted window', async () => {
		await expect(
			build([], { billed: 0, fromCache: 0 }).execute({ organizationId: ORG, from: TO, to: FROM }),
		).rejects.toThrow(InvalidInputError);
	});

	it('rejects a zero-length window', async () => {
		await expect(
			build([], { billed: 0, fromCache: 0 }).execute({ organizationId: ORG, from: FROM, to: FROM }),
		).rejects.toThrow(InvalidInputError);
	});
});
