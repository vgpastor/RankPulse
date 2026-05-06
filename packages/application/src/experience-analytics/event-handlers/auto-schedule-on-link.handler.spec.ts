import {
	ExperienceAnalytics,
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnClarityProjectLinkedHandler,
	CLARITY_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-link.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const CLARITY_PROJECT_ID = '77777777-7777-7777-7777-777777777777' as ExperienceAnalytics.ClarityProjectId;
const CLARITY_HANDLE = 'abcd1234ef';

const buildEvent = (overrides: Partial<ExperienceAnalytics.ClarityProjectLinked> = {}) =>
	new ExperienceAnalytics.ClarityProjectLinked({
		clarityProjectId: CLARITY_PROJECT_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		clarityHandle: CLARITY_HANDLE,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnClarityProjectLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnClarityProjectLinkedHandler', () => {
	it('ignores events of other types', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle({
			type: 'GscPropertyLinked',
			occurredAt: new Date(),
		} as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('schedules with idempotencyKey {clarityProjectId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'microsoft-clarity',
			endpointId: 'clarity-data-export',
			cron: '0 6 * * *',
			idempotencyKey: { systemParamKey: 'clarityProjectId', systemParamValue: CLARITY_PROJECT_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, clarityProjectId: CLARITY_PROJECT_ID });
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnClarityProjectLinkedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalled();
	});

	it('exposes defaults', () => {
		expect(CLARITY_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'microsoft-clarity',
			endpointId: 'clarity-data-export',
			cron: '0 6 * * *',
		});
	});
});
