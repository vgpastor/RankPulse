import {
	BingWebmasterInsights,
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnBingPropertyLinkedHandler,
	BING_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-link.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const PROPERTY_ID = '66666666-6666-6666-6666-666666666666' as BingWebmasterInsights.BingPropertyId;
const SITE_URL = 'https://patroltech.online/';

const buildEvent = (overrides: Partial<BingWebmasterInsights.BingPropertyLinked> = {}) =>
	new BingWebmasterInsights.BingPropertyLinked({
		bingPropertyId: PROPERTY_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		siteUrl: SITE_URL,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnBingPropertyLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnBingPropertyLinkedHandler', () => {
	it('ignores events of other types', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle({
			type: 'GscPropertyLinked',
			occurredAt: new Date(),
		} as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('schedules with idempotencyKey {bingPropertyId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'bing-webmaster',
			endpointId: 'bing-rank-and-traffic-stats',
			cron: '0 5 * * *',
			idempotencyKey: { systemParamKey: 'bingPropertyId', systemParamValue: PROPERTY_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, bingPropertyId: PROPERTY_ID });
		expect(cmd.params).toMatchObject({ siteUrl: SITE_URL });
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnBingPropertyLinkedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalled();
	});

	it('exposes defaults', () => {
		expect(BING_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'bing-webmaster',
			endpointId: 'bing-rank-and-traffic-stats',
			cron: '0 5 * * *',
		});
	});
});
