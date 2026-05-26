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

describe('CompetitorAdded → wayback-only schedule (#179 — dropped DataForSEO Backlinks)', () => {
	const event = new ProjectManagement.CompetitorAdded({
		competitorId: COMPETITOR_ID,
		projectId: PROJECT_ID,
		domain: 'silvertraconline.com',
		label: 'Silvertrac',
		occurredAt: new Date('2026-05-09T12:00:00Z'),
	});

	it('emits exactly 1 wayback schedule per competitor (no backlinks, no locale fan-out)', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);
		expect(specs).toHaveLength(1);

		const wayback = specs?.find((s) => s.endpointId === 'wayback-cdx-snapshots');
		expect(wayback).toBeDefined();
		expect(wayback?.providerId).toBe('wayback');
	});

	it('does NOT emit a dataforseo-backlinks-summary schedule (#179 — Backlinks API is paid and dropped)', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);
		expect(specs?.find((s) => s.endpointId === 'dataforseo-backlinks-summary')).toBeUndefined();
		expect(specs?.find((s) => s.providerId === 'dataforseo')).toBeUndefined();
	});

	it('stamps systemParams.competitorId so the wayback ingest handler finds it', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);
		const wayback = specs?.find((s) => s.endpointId === 'wayback-cdx-snapshots');

		expect(wayback?.systemParamKey).toBe('competitorId');
		expect(wayback?.systemParamsBuilder(event)).toEqual({ competitorId: COMPETITOR_ID });
	});

	it('stamps params with the competitor domain in the wayback-expected field', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);
		const wayback = specs?.find((s) => s.endpointId === 'wayback-cdx-snapshots');

		// Wayback CDX uses `domain` (NOT `target` — that's DataForSEO).
		expect(wayback?.paramsBuilder(event)).toMatchObject({
			domain: 'silvertraconline.com',
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

	it('uses competitorId as the idempotency key so re-firing the event is a no-op', async () => {
		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, {} as never);
		for (const spec of specs ?? []) {
			expect(spec.systemParamKey).toBe('competitorId');
			const sysParams = spec.systemParamsBuilder(event);
			expect(typeof sysParams.competitorId).toBe('string');
			expect(sysParams.competitorId).toBe(COMPETITOR_ID);
		}
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
