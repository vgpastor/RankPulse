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
	it('exports a CompetitorAdded config and a ProjectCreated config', () => {
		expect(projectManagementAutoScheduleConfigs.map((c) => c.event).sort()).toEqual([
			'project-management.CompetitorAdded',
			'project-management.DomainAdded',
			'project-management.ProjectCreated',
		]);
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

describe('ProjectCreated → monthly authority reading of the project domain', () => {
	const projectCreatedConfig = projectManagementAutoScheduleConfigs.find(
		(c) => c.event === 'project-management.ProjectCreated',
	);
	const event = new ProjectManagement.ProjectCreated({
		projectId: PROJECT_ID,
		organizationId: '99999999-9999-9999-9999-999999999999' as Uuid as never,
		portfolioId: null,
		primaryDomain: 'rondasoffline.com',
		kind: ProjectManagement.ProjectKinds.OWN,
		occurredAt: new Date('2026-09-19T10:00:00Z'),
	});

	it('schedules exactly one dataforseo-project-authority feeder', async () => {
		const specs = await projectCreatedConfig?.dynamicSchedules?.(event, {} as never);
		expect(specs).toHaveLength(1);
		expect(specs?.[0]?.providerId).toBe('dataforseo');
		expect(specs?.[0]?.endpointId).toBe('dataforseo-project-authority');
	});

	it('targets the project domain with the DataForSEO field name, keyed by domain', async () => {
		const specs = await projectCreatedConfig?.dynamicSchedules?.(event, {} as never);
		const spec = specs?.[0];
		expect(spec?.paramsBuilder(event)).toEqual({ target: 'rondasoffline.com', includeSubdomains: true });
		expect(spec?.systemParamKey).toBe('domain');
		expect(spec?.systemParamsBuilder(event)).toEqual({ projectId: PROJECT_ID, domain: 'rondasoffline.com' });
	});

	it('ignores every other event', async () => {
		const other = new ProjectManagement.CompetitorAdded({
			competitorId: COMPETITOR_ID,
			projectId: PROJECT_ID,
			domain: 'x.com',
			label: 'x',
			occurredAt: new Date('2026-09-19T10:00:00Z'),
		});
		expect(await projectCreatedConfig?.dynamicSchedules?.(other, {} as never)).toEqual([]);
	});
});

describe('DomainAdded → authority reading for each main secondary domain', () => {
	const domainAddedConfig = projectManagementAutoScheduleConfigs.find(
		(c) => c.event === 'project-management.DomainAdded',
	);
	const added = (kind: 'main' | 'subdomain' | 'alias') =>
		new ProjectManagement.DomainAdded({
			projectId: PROJECT_ID,
			domain: 'softwarerondas.com',
			kind,
			occurredAt: new Date('2026-09-19T10:00:00Z'),
		});

	// The satellites are secondary domains of four projects, registered as
	// `alias` (in production every secondary domain is). Each one gets a
	// reading of its own.
	it.each([
		'main',
		'alias',
	] as const)('schedules one feeder for a %s domain, keyed by that domain', async (kind) => {
		const specs = await domainAddedConfig?.dynamicSchedules?.(added(kind), {} as never);
		expect(specs).toHaveLength(1);
		expect(specs?.[0]?.systemParamsBuilder(added(kind))).toEqual({
			projectId: PROJECT_ID,
			domain: 'softwarerondas.com',
		});
	});

	it('skips a subdomain, which shares its parent link graph', async () => {
		expect(await domainAddedConfig?.dynamicSchedules?.(added('subdomain'), {} as never)).toEqual([]);
	});
});
