import {
	type IdentityAccess,
	MetaAdsAttribution,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnMetaPixelLinkedHandler,
	META_PIXEL_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-meta-pixel-linked.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const PIXEL_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as MetaAdsAttribution.MetaPixelId;
const PIXEL_HANDLE = '12345678901';

const buildEvent = (overrides: Partial<MetaAdsAttribution.MetaPixelLinked> = {}) =>
	new MetaAdsAttribution.MetaPixelLinked({
		metaPixelId: PIXEL_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		pixelHandle: PIXEL_HANDLE,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnMetaPixelLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnMetaPixelLinkedHandler', () => {
	it('ignores events of other types', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle({
			type: 'GscPropertyLinked',
			occurredAt: new Date(),
		} as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('schedules with idempotencyKey {metaPixelId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'meta',
			endpointId: 'meta-pixel-events-stats',
			cron: '30 4 * * *',
			credentialOverrideId: null,
			idempotencyKey: { systemParamKey: 'metaPixelId', systemParamValue: PIXEL_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, metaPixelId: PIXEL_ID });
		expect(cmd.params).toMatchObject({
			pixelId: PIXEL_HANDLE,
			startDate: '{{today-30}}',
			endDate: '{{today-1}}',
		});
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnMetaPixelLinkedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ metaPixelId: PIXEL_ID, err: 'boom' }),
			expect.stringContaining('auto-schedule failed'),
		);
	});

	it('exposes defaults', () => {
		expect(META_PIXEL_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'meta',
			endpointId: 'meta-pixel-events-stats',
			cron: '30 4 * * *',
		});
	});
});
