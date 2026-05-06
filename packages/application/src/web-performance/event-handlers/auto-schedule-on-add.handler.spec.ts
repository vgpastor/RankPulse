import {
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
	WebPerformance,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnTrackedPageAddedHandler,
	PSI_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-add.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const TRACKED_PAGE_ID = '88888888-8888-8888-8888-888888888888' as WebPerformance.TrackedPageId;
const URL = 'https://patroltech.online/blog/post';
const STRATEGY: WebPerformance.PageSpeedStrategy = 'mobile';

const buildEvent = (overrides: Partial<WebPerformance.TrackedPageAdded> = {}) =>
	new WebPerformance.TrackedPageAdded({
		trackedPageId: TRACKED_PAGE_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		url: URL,
		strategy: STRATEGY,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnTrackedPageAddedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnTrackedPageAddedHandler', () => {
	it('ignores other event types', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle({
			type: 'GscPropertyLinked',
			occurredAt: new Date(),
		} as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('schedules with idempotencyKey {trackedPageId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'pagespeed',
			endpointId: 'psi-runpagespeed',
			cron: '0 7 * * *',
			idempotencyKey: { systemParamKey: 'trackedPageId', systemParamValue: TRACKED_PAGE_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, trackedPageId: TRACKED_PAGE_ID });
		expect(cmd.params).toMatchObject({ url: URL, strategy: STRATEGY });
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnTrackedPageAddedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalled();
	});

	it('exposes defaults', () => {
		expect(PSI_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'pagespeed',
			endpointId: 'psi-runpagespeed',
			cron: '0 7 * * *',
		});
	});
});
