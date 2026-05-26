import { ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import { projectManagementAutoScheduleConfigs } from './auto-schedule.config.js';

// Field contracts the auto-schedule MUST satisfy for each provider. Kept
// inline (not importing the provider Zod schemas) to honour CLAUDE.md §3
// dependency rules — `application` can't import `providers/*`. Drift
// between this list and the real schemas would only surface on a provider
// change; the assertions below are narrow enough that a field rename
// (the bug in PR #185 review P0-1: `target` vs `domain`) fails loudly.
const WAYBACK_REQUIRED_FIELDS = ['domain', 'from', 'to'] as const;
const WAYBACK_DATE_PATTERN = /^\d{8}(?:\d{2})?$|^\{\{today(?:-\d+)?\}\}$/;
const BACKLINKS_REQUIRED_FIELDS = ['target'] as const;

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

	it('stamps params with the competitor domain in the field name each provider expects', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);

		const wayback = specs?.find((s) => s.endpointId === 'wayback-cdx-snapshots');
		const backlinks = specs?.find((s) => s.endpointId === 'dataforseo-backlinks-summary');

		// Wayback CDX uses `domain` (NOT `target` — that's DataForSEO).
		expect(wayback?.paramsBuilder(event)).toMatchObject({
			domain: 'silvertraconline.com',
		});
		// DataForSEO backlinks-summary uses `target`.
		expect(backlinks?.paramsBuilder(event)).toMatchObject({
			target: 'silvertraconline.com',
		});
	});

	// Regression guard for PR #185 review P0-1: the params built MUST contain
	// each provider's required fields with the right names. Pre-fix the
	// wayback paramsBuilder emitted {target, competitorId} which the provider
	// Zod schema rejected → InvalidInputError → handler swallowed it →
	// schedule never created. Failure mode invisible until empty tables.
	it('wayback paramsBuilder uses {domain, from, to} (NOT {target}) and date tokens match the provider regex', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);
		const wayback = specs?.find((s) => s.endpointId === 'wayback-cdx-snapshots');
		const params = wayback?.paramsBuilder(event) as Record<string, unknown>;

		for (const field of WAYBACK_REQUIRED_FIELDS) {
			expect(params).toHaveProperty(field);
		}
		expect(params.domain).toBe('silvertraconline.com');
		// `target` would be a regression — that's the DataForSEO contract.
		expect(params).not.toHaveProperty('target');
		expect(params.from).toMatch(WAYBACK_DATE_PATTERN);
		expect(params.to).toMatch(WAYBACK_DATE_PATTERN);
	});

	it('backlinks paramsBuilder uses {target} (NOT {domain})', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);
		const backlinks = specs?.find((s) => s.endpointId === 'dataforseo-backlinks-summary');
		const params = backlinks?.paramsBuilder(event) as Record<string, unknown>;

		for (const field of BACKLINKS_REQUIRED_FIELDS) {
			expect(params).toHaveProperty(field);
		}
		expect(params.target).toBe('silvertraconline.com');
		expect(params).not.toHaveProperty('domain');
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
