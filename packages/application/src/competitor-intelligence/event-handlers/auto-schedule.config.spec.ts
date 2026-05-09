import { ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import {
	competitorIntelligenceAutoScheduleConfigs,
	DATAFORSEO_LOCATION_CODES,
} from './auto-schedule.config.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as ProjectManagement.ProjectId;
const COMPETITOR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as ProjectManagement.CompetitorId;

const buildProject = (locations: { country: string; language: string }[]) => ({
	id: PROJECT_ID,
	primaryDomain: ProjectManagement.DomainName.create('patroltech.online'),
	locations: locations.map((l) => ProjectManagement.LocationLanguage.create(l)),
});

const fakeProjectRepo = (project: ReturnType<typeof buildProject> | null) => ({
	findById: vi.fn().mockResolvedValue(project),
});

const competitorAddedConfig = competitorIntelligenceAutoScheduleConfigs.find(
	(c) => c.event === 'project-management.CompetitorAdded',
);
const domainAddedConfig = competitorIntelligenceAutoScheduleConfigs.find(
	(c) => c.event === 'project-management.DomainAdded',
);

describe('competitor-intelligence auto-schedule', () => {
	it('exports a config for both CompetitorAdded and DomainAdded', () => {
		expect(competitorIntelligenceAutoScheduleConfigs).toHaveLength(2);
		expect(competitorAddedConfig).toBeDefined();
		expect(domainAddedConfig).toBeDefined();
	});

	it('maps the 5 PatrolTech markets to DataForSEO location codes', () => {
		expect(DATAFORSEO_LOCATION_CODES.ES).toBe(2724);
		expect(DATAFORSEO_LOCATION_CODES.US).toBe(2840);
		expect(DATAFORSEO_LOCATION_CODES.GB).toBe(2826);
		expect(DATAFORSEO_LOCATION_CODES.FR).toBe(2250);
		expect(DATAFORSEO_LOCATION_CODES.MX).toBe(2484);
	});
});

describe('CompetitorAdded → schedules', () => {
	const event = new ProjectManagement.CompetitorAdded({
		competitorId: COMPETITOR_ID,
		projectId: PROJECT_ID,
		domain: 'silvertraconline.com',
		label: 'Silvertrac',
		occurredAt: new Date('2026-05-09T12:00:00Z'),
	});

	it('emits 1 ranked-keywords + 1 domain-intersection per project location', async () => {
		const project = buildProject([{ country: 'ES', language: 'es-ES' }]);
		const deps = { projectRepo: fakeProjectRepo(project) } as never;

		const specs = await competitorAddedConfig?.dynamicSchedules?.(event, deps);
		expect(specs).toBeDefined();
		expect(specs).toHaveLength(2);
		const rk = specs?.find((s) => s.endpointId === 'dataforseo-labs-ranked-keywords');
		const di = specs?.find((s) => s.endpointId === 'dataforseo-labs-domain-intersection');
		expect(rk).toBeDefined();
		expect(di).toBeDefined();

		// ranked-keywords params target the COMPETITOR domain
		expect(rk?.paramsBuilder(event)).toMatchObject({
			target: 'silvertraconline.com',
			locationCode: 2724,
			languageCode: 'es',
			limit: 1_000,
		});
		expect(rk?.systemParamsBuilder(event)).toMatchObject({
			targetDomain: 'silvertraconline.com',
			country: 'ES',
		});

		// domain-intersection params pair OUR primary × the competitor
		expect(di?.paramsBuilder(event)).toMatchObject({
			targets: ['patroltech.online', 'silvertraconline.com'],
			locationCode: 2724,
			languageCode: 'es',
		});
		const diSys = di?.systemParamsBuilder(event);
		expect(diSys).toMatchObject({
			ourDomain: 'patroltech.online',
			competitorDomain: 'silvertraconline.com',
		});
		// Composite idempotency key — guarantees per-locale uniqueness so
		// the second locale of a multi-market project isn't dropped by
		// ScheduleEndpointFetchUseCase's idempotency check.
		expect(diSys?.intersectionScheduleKey).toBe(
			'patroltech.online|silvertraconline.com|ES|es',
		);
	});

	it('fans out per locale on multi-market projects (US + GB)', async () => {
		const project = buildProject([
			{ country: 'US', language: 'en-US' },
			{ country: 'GB', language: 'en-GB' },
		]);
		const deps = { projectRepo: fakeProjectRepo(project) } as never;

		const specs = (await competitorAddedConfig?.dynamicSchedules?.(event, deps)) ?? [];
		expect(specs).toHaveLength(4); // 2 specs × 2 locations

		const di = specs.filter((s) => s.endpointId === 'dataforseo-labs-domain-intersection');
		const keys = di.map((d) => d.systemParamsBuilder(event).intersectionScheduleKey);
		expect(keys).toContain('patroltech.online|silvertraconline.com|US|en');
		expect(keys).toContain('patroltech.online|silvertraconline.com|GB|en');
	});

	it('skips locations with un-mapped country codes (logs and continues)', async () => {
		const project = buildProject([
			{ country: 'ES', language: 'es-ES' },
			{ country: 'JP', language: 'ja-JP' }, // not in DATAFORSEO_LOCATION_CODES
		]);
		const deps = { projectRepo: fakeProjectRepo(project) } as never;

		const specs = (await competitorAddedConfig?.dynamicSchedules?.(event, deps)) ?? [];
		// Only ES generated specs, JP is skipped — 2 specs total (not 4).
		expect(specs).toHaveLength(2);
	});

	it('returns [] when project is missing or has no locations', async () => {
		expect(
			await competitorAddedConfig?.dynamicSchedules?.(event, {
				projectRepo: fakeProjectRepo(null),
			} as never),
		).toEqual([]);

		const empty = buildProject([]);
		expect(
			await competitorAddedConfig?.dynamicSchedules?.(event, {
				projectRepo: fakeProjectRepo(empty),
			} as never),
		).toEqual([]);
	});
});

describe('DomainAdded → schedules', () => {
	const event = new ProjectManagement.DomainAdded({
		projectId: PROJECT_ID,
		domain: 'softwarerondas.com',
		kind: 'alias',
		occurredAt: new Date('2026-05-09T12:00:00Z'),
	});

	it('emits 1 ranked-keywords per project location with target = added domain', async () => {
		const project = buildProject([{ country: 'ES', language: 'es-ES' }]);
		const deps = { projectRepo: fakeProjectRepo(project) } as never;

		const specs = (await domainAddedConfig?.dynamicSchedules?.(event, deps)) ?? [];
		expect(specs).toHaveLength(1);
		expect(specs[0]?.endpointId).toBe('dataforseo-labs-ranked-keywords');
		expect(specs[0]?.paramsBuilder(event)).toMatchObject({
			target: 'softwarerondas.com',
			locationCode: 2724,
			languageCode: 'es',
		});
		expect(specs[0]?.systemParamsBuilder(event)).toMatchObject({
			targetDomain: 'softwarerondas.com',
		});
	});

	it('does not care about kind (main vs alias vs subdomain)', async () => {
		const project = buildProject([{ country: 'ES', language: 'es-ES' }]);
		const deps = { projectRepo: fakeProjectRepo(project) } as never;

		const mainEvent = new ProjectManagement.DomainAdded({
			projectId: PROJECT_ID,
			domain: 'patroltech.online',
			kind: 'main',
			occurredAt: new Date(),
		});
		const aliasEvent = new ProjectManagement.DomainAdded({
			projectId: PROJECT_ID,
			domain: 'softwarerondas.com',
			kind: 'alias',
			occurredAt: new Date(),
		});

		const mainSpecs = (await domainAddedConfig?.dynamicSchedules?.(mainEvent, deps)) ?? [];
		const aliasSpecs = (await domainAddedConfig?.dynamicSchedules?.(aliasEvent, deps)) ?? [];
		expect(mainSpecs).toHaveLength(1);
		expect(aliasSpecs).toHaveLength(1);
	});
});
