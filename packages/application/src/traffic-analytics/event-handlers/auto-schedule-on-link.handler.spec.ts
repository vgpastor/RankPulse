import {
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
	TrafficAnalytics,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnGa4PropertyLinkedHandler,
	GA4_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-link.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const PROPERTY_ID = '44444444-4444-4444-4444-444444444444' as TrafficAnalytics.Ga4PropertyId;
const GA4_PROPERTY_HANDLE = 'properties/123456789';

const buildEvent = (overrides: Partial<TrafficAnalytics.Ga4PropertyLinked> = {}) =>
	new TrafficAnalytics.Ga4PropertyLinked({
		ga4PropertyId: PROPERTY_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		propertyHandle: GA4_PROPERTY_HANDLE,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnGa4PropertyLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnGa4PropertyLinkedHandler', () => {
	it('ignores events of other types', async () => {
		const { handler, execute } = buildHandler();
		const otherEvent = {
			type: 'GscPropertyLinked',
			occurredAt: new Date(),
		} as unknown as SharedKernel.DomainEvent;
		await handler.handle(otherEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('on Ga4PropertyLinked, calls ScheduleEndpointFetch with defaults + idempotencyKey {ga4PropertyId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		expect(execute).toHaveBeenCalledTimes(1);
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'google-analytics-4',
			endpointId: 'ga4-run-report',
			cron: '0 5 * * *',
			credentialOverrideId: null,
			idempotencyKey: { systemParamKey: 'ga4PropertyId', systemParamValue: PROPERTY_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, ga4PropertyId: PROPERTY_ID });
		expect(cmd.params).toMatchObject({
			propertyId: GA4_PROPERTY_HANDLE,
			startDate: '{{today-30}}',
			endDate: '{{today-2}}',
		});
	});

	it('logs info on success with the new definition id', async () => {
		const { handler, logger } = buildHandler();
		await handler.handle(buildEvent());
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ ga4PropertyId: PROPERTY_ID, definitionId: 'def-1' }),
			expect.stringContaining('auto-scheduled'),
		);
	});

	it('SWALLOWS errors and logs them (link is already persisted)', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('scheduler down'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnGa4PropertyLinkedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ ga4PropertyId: PROPERTY_ID, err: 'scheduler down' }),
			expect.stringContaining('auto-schedule failed'),
		);
	});

	it('exposes its defaults for composition root and integration tests', () => {
		expect(GA4_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'google-analytics-4',
			endpointId: 'ga4-run-report',
			cron: '0 5 * * *',
		});
	});
});
