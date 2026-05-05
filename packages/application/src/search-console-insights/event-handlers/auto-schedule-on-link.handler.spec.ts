import {
	type IdentityAccess,
	type ProjectManagement,
	SearchConsoleInsights,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnGscPropertyLinkedHandler,
	GSC_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-link.handler.js';

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

const buildHandler = () => {
	// Mock at the use-case interface boundary, not deeper. The handler's job
	// is purely to translate event → use case call; we don't need a real
	// JobDefinition repo or scheduler in scope for that.
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnGscPropertyLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnGscPropertyLinkedHandler', () => {
	it('ignores events of other types (the publisher fans every event to every listener)', async () => {
		const { handler, execute } = buildHandler();
		const otherEvent = { type: 'DomainAdded', occurredAt: new Date() } as unknown as SharedKernel.DomainEvent;
		await handler.handle(otherEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('on GscPropertyLinked, calls ScheduleEndpointFetch with daily-cron defaults + relative date tokens', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());

		expect(execute).toHaveBeenCalledTimes(1);
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'google-search-console',
			endpointId: 'gsc-search-analytics',
			cron: '0 5 * * *',
			credentialOverrideId: null,
		});
		expect(cmd.params).toEqual({
			siteUrl: SITE_URL,
			startDate: '{{today-30}}',
			endDate: '{{today-2}}',
			dimensions: ['date', 'query', 'page'],
			rowLimit: 25_000,
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, gscPropertyId: PROPERTY_ID });
	});

	it('uses DOMAIN siteUrl as-is (does not mangle the sc-domain: prefix)', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent({ siteUrl: 'sc-domain:example.com' }));
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect((cmd.params as { siteUrl: string }).siteUrl).toBe('sc-domain:example.com');
	});

	it('logs an info line on success with the new definition id', async () => {
		const { handler, logger } = buildHandler();
		await handler.handle(buildEvent());
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ gscPropertyId: PROPERTY_ID, definitionId: 'def-1' }),
			expect.stringContaining('auto-scheduled'),
		);
	});

	it('SWALLOWS errors from ScheduleEndpointFetch (link is already persisted) and logs them', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('scheduler down'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnGscPropertyLinkedHandler(useCase, logger);

		// Must NOT throw — the domain event has already happened, the property
		// row has already been saved, raising here would be a useless 500 to
		// the API caller.
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();

		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ gscPropertyId: PROPERTY_ID, err: 'scheduler down' }),
			expect.stringContaining('auto-schedule failed'),
		);
		expect(logger.info).not.toHaveBeenCalled();
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
