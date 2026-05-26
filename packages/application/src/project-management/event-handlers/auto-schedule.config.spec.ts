import { ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import { projectManagementAutoScheduleConfigs } from './auto-schedule.config.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as ProjectManagement.ProjectId;
const COMPETITOR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as ProjectManagement.CompetitorId;

const competitorAddedConfig = projectManagementAutoScheduleConfigs.find(
	(c) => c.event === 'project-management.CompetitorAdded',
);

describe('project-management auto-schedule', () => {
	it('exports a CompetitorAdded config', () => {
		expect(projectManagementAutoScheduleConfigs).toHaveLength(1);
		expect(competitorAddedConfig).toBeDefined();
		expect(competitorAddedConfig?.event).toBe('project-management.CompetitorAdded');
	});
});

describe('CompetitorAdded → wayback + backlinks schedules (#181, #184)', () => {
	const event = new ProjectManagement.CompetitorAdded({
		competitorId: COMPETITOR_ID,
		projectId: PROJECT_ID,
		domain: 'silvertraconline.com',
		label: 'Silvertrac',
		occurredAt: new Date('2026-05-09T12:00:00Z'),
	});

	it('emits exactly 1 wayback + 1 backlinks schedule per competitor (no locale fan-out)', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);
		expect(specs).toHaveLength(2);

		const wayback = specs?.find((s) => s.endpointId === 'wayback-cdx-snapshots');
		const backlinks = specs?.find((s) => s.endpointId === 'dataforseo-backlinks-summary');
		expect(wayback).toBeDefined();
		expect(backlinks).toBeDefined();
		expect(wayback?.providerId).toBe('wayback');
		expect(backlinks?.providerId).toBe('dataforseo');
	});

	it('stamps systemParams.competitorId so the ingest handlers find it', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);

		const wayback = specs?.find((s) => s.endpointId === 'wayback-cdx-snapshots');
		const backlinks = specs?.find((s) => s.endpointId === 'dataforseo-backlinks-summary');

		expect(wayback?.systemParamKey).toBe('competitorId');
		expect(wayback?.systemParamsBuilder(event)).toEqual({ competitorId: COMPETITOR_ID });
		expect(backlinks?.systemParamKey).toBe('competitorId');
		expect(backlinks?.systemParamsBuilder(event)).toEqual({ competitorId: COMPETITOR_ID });
	});

	it('stamps params.target with the competitor domain (provider input contract)', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);

		const wayback = specs?.find((s) => s.endpointId === 'wayback-cdx-snapshots');
		const backlinks = specs?.find((s) => s.endpointId === 'dataforseo-backlinks-summary');

		expect(wayback?.paramsBuilder(event)).toMatchObject({
			target: 'silvertraconline.com',
			competitorId: COMPETITOR_ID,
		});
		expect(backlinks?.paramsBuilder(event)).toMatchObject({
			target: 'silvertraconline.com',
			competitorId: COMPETITOR_ID,
		});
	});

	it('uses competitorId as the idempotency key so re-firing the event is a no-op', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);
		for (const spec of specs ?? []) {
			expect(spec.systemParamKey).toBe('competitorId');
			const sysParams = spec.systemParamsBuilder(event);
			expect(typeof sysParams.competitorId).toBe('string');
			expect(sysParams.competitorId).toBe(COMPETITOR_ID);
		}
	});

	it('spreads crons across Monday morning to avoid same-second rate-limit collisions', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);
		const crons = (specs ?? []).map((s) => s.cron);
		// Both Monday early morning, but different hours
		expect(crons).toContain('0 5 * * 1');
		expect(crons).toContain('0 6 * * 1');
		expect(new Set(crons).size).toBe(crons.length);
	});

	it('returns empty array for unrelated events', async () => {
		const otherEvent = {
			type: 'project-management.DomainAdded',
			occurredAt: new Date(),
		} as never;
		const specs = await competitorAddedConfig?.dynamicSchedules?.(otherEvent, {} as never);
		expect(specs).toEqual([]);
	});
});
