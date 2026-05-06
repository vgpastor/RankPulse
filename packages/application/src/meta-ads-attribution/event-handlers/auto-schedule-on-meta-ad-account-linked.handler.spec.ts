import {
	type IdentityAccess,
	MetaAdsAttribution,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnMetaAdAccountLinkedHandler,
	META_AD_ACCOUNT_AUTO_SCHEDULES,
} from './auto-schedule-on-meta-ad-account-linked.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const ACCOUNT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as MetaAdsAttribution.MetaAdAccountId;
const ACCOUNT_HANDLE = 'act_987654321';

const buildEvent = (overrides: Partial<MetaAdsAttribution.MetaAdAccountLinked> = {}) =>
	new MetaAdsAttribution.MetaAdAccountLinked({
		metaAdAccountId: ACCOUNT_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		adAccountHandle: ACCOUNT_HANDLE,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-x' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnMetaAdAccountLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnMetaAdAccountLinkedHandler', () => {
	it('ignores events of other types', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle({
			type: 'GscPropertyLinked',
			occurredAt: new Date(),
		} as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('fans out into TWO schedules: meta-ads-insights AND meta-custom-audiences', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());

		expect(execute).toHaveBeenCalledTimes(2);

		const calls = execute.mock.calls.map(
			(c) => c[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0],
		);
		const insights = calls.find((c) => c.endpointId === 'meta-ads-insights');
		const audiences = calls.find((c) => c.endpointId === 'meta-custom-audiences');

		expect(insights).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'meta',
			cron: '45 4 * * *',
			credentialOverrideId: null,
			idempotencyKey: { systemParamKey: 'metaAdAccountId', systemParamValue: ACCOUNT_ID },
		});
		expect(insights?.systemParams).toEqual({ organizationId: ORG_ID, metaAdAccountId: ACCOUNT_ID });
		expect(insights?.params).toMatchObject({
			adAccountId: ACCOUNT_HANDLE,
			startDate: '{{today-30}}',
			endDate: '{{today-1}}',
		});

		expect(audiences).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'meta',
			cron: '0 5 * * 1',
			credentialOverrideId: null,
			idempotencyKey: { systemParamKey: 'metaAdAccountId', systemParamValue: ACCOUNT_ID },
		});
		expect(audiences?.systemParams).toEqual({ organizationId: ORG_ID, metaAdAccountId: ACCOUNT_ID });
		expect(audiences?.params).toEqual({ adAccountId: ACCOUNT_HANDLE });
	});

	it('failure on one schedule does not abort the sibling', async () => {
		// First call (insights) rejects; second call (audiences) resolves. Both
		// fire because Promise.all waits for both regardless of one rejecting.
		const execute = vi
			.fn()
			.mockRejectedValueOnce(new Error('insights down'))
			.mockResolvedValueOnce({ definitionId: 'def-aud' });
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnMetaAdAccountLinkedHandler(useCase, logger);

		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();

		expect(execute).toHaveBeenCalledTimes(2);
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ metaAdAccountId: ACCOUNT_ID, endpointId: 'meta-ads-insights' }),
			expect.stringContaining('auto-schedule failed'),
		);
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ metaAdAccountId: ACCOUNT_ID, endpointId: 'meta-custom-audiences' }),
			expect.stringContaining('auto-scheduled'),
		);
	});

	it('exposes the schedule list (insights daily, audiences weekly)', () => {
		expect(META_AD_ACCOUNT_AUTO_SCHEDULES).toHaveLength(2);
		const ids = META_AD_ACCOUNT_AUTO_SCHEDULES.map((s) => s.endpointId);
		expect(ids).toEqual(expect.arrayContaining(['meta-ads-insights', 'meta-custom-audiences']));
	});
});
