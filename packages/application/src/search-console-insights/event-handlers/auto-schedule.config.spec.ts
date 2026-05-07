import { type IdentityAccess, type ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { describe, expect, it } from 'vitest';
import {
	GSC_AUTO_SCHEDULE_DEFAULTS,
	searchConsoleInsightsAutoScheduleConfigs,
} from './auto-schedule.config.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const PROPERTY_ID = '33333333-3333-3333-3333-333333333333' as SearchConsoleInsights.GscPropertyId;
const SITE_URL = 'sc-domain:patroltech.online';

const buildEvent = (overrides: Partial<SearchConsoleInsights.GscPropertyLinked> = {}) =>
	new SearchConsoleInsights.GscPropertyLinked({
		gscPropertyId: PROPERTY_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		siteUrl: SITE_URL,
		propertyType: 'DOMAIN',
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

describe('searchConsoleInsightsAutoScheduleConfigs', () => {
	it('targets exactly the GscPropertyLinked event with daily-cron defaults', () => {
		expect(searchConsoleInsightsAutoScheduleConfigs).toHaveLength(1);
		const [config] = searchConsoleInsightsAutoScheduleConfigs;
		if (!config) throw new Error('expected one config');
		expect(config.event).toBe('GscPropertyLinked');
		expect(config.schedule).toMatchObject({
			providerId: 'google-search-console',
			endpointId: 'gsc-search-analytics',
			cron: '0 5 * * *',
			systemParamKey: 'gscPropertyId',
		});
	});

	it('paramsBuilder produces the rolling 30-day token window with the descriptor defaults', () => {
		const [config] = searchConsoleInsightsAutoScheduleConfigs;
		if (!config?.schedule) throw new Error('expected a single schedule');
		const params = config.schedule.paramsBuilder(buildEvent());
		expect(params).toEqual({
			siteUrl: SITE_URL,
			startDate: '{{today-30}}',
			endDate: '{{today-2}}',
			dimensions: ['date', 'query', 'page'],
			rowLimit: 25_000,
		});
	});

	it('paramsBuilder uses DOMAIN siteUrl as-is (does not mangle the sc-domain: prefix)', () => {
		const [config] = searchConsoleInsightsAutoScheduleConfigs;
		if (!config?.schedule) throw new Error('expected a single schedule');
		const params = config.schedule.paramsBuilder(buildEvent({ siteUrl: 'sc-domain:example.com' }));
		expect((params as { siteUrl: string }).siteUrl).toBe('sc-domain:example.com');
	});

	it('systemParamsBuilder carries organizationId + gscPropertyId for idempotency keying', () => {
		const [config] = searchConsoleInsightsAutoScheduleConfigs;
		if (!config?.schedule) throw new Error('expected a single schedule');
		const systemParams = config.schedule.systemParamsBuilder(buildEvent());
		expect(systemParams).toEqual({ organizationId: ORG_ID, gscPropertyId: PROPERTY_ID });
	});

	it('exposes its defaults for the composition root and integration tests to lock against', () => {
		expect(GSC_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'google-search-console',
			endpointId: 'gsc-search-analytics',
			cron: '0 5 * * *',
			startDateToken: '{{today-30}}',
			endDateToken: '{{today-2}}',
		});
	});
});
