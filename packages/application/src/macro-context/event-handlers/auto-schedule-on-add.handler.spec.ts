import {
	type IdentityAccess,
	MacroContext,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnMonitoredDomainAddedHandler,
	RADAR_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-add.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const DOMAIN_ID = '99999999-9999-9999-9999-999999999999' as MacroContext.MonitoredDomainId;
const DOMAIN = 'patroltech.online';

const buildEvent = (overrides: Partial<MacroContext.MonitoredDomainAdded> = {}) =>
	new MacroContext.MonitoredDomainAdded({
		monitoredDomainId: DOMAIN_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		domain: DOMAIN,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnMonitoredDomainAddedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnMonitoredDomainAddedHandler', () => {
	it('ignores other event types', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle({
			type: 'GscPropertyLinked',
			occurredAt: new Date(),
		} as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('schedules with idempotencyKey {monitoredDomainId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'cloudflare-radar',
			endpointId: 'radar-domain-rank',
			cron: '0 6 * * *',
			idempotencyKey: { systemParamKey: 'monitoredDomainId', systemParamValue: DOMAIN_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, monitoredDomainId: DOMAIN_ID });
		expect(cmd.params).toMatchObject({ domain: DOMAIN });
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnMonitoredDomainAddedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalled();
	});

	it('exposes defaults', () => {
		expect(RADAR_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'cloudflare-radar',
			endpointId: 'radar-domain-rank',
			cron: '0 6 * * *',
		});
	});
});
