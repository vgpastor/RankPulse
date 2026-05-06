import type { SharedKernel } from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import { type AutoScheduleConfig, buildAutoScheduleHandlers } from './auto-schedule.js';
import type { SharedDeps } from './module.js';

interface FakeEvent extends SharedKernel.DomainEvent {
	readonly type: 'FakeEntityLinked';
	readonly entityId: string;
	readonly projectId: string;
	readonly organizationId: string;
}

const fakeEvent = (overrides: Partial<FakeEvent> = {}): FakeEvent => ({
	type: 'FakeEntityLinked',
	entityId: 'fake-id',
	projectId: 'project-1',
	organizationId: 'org-1',
	occurredAt: new Date(),
	...overrides,
});

const buildDeps = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const logger = {
		child: () => logger,
		info: vi.fn(),
		error: vi.fn(),
	};
	const deps = {
		scheduleEndpointFetch: { execute },
		logger,
		_brand: 'SharedDeps' as const,
	} as unknown as SharedDeps;
	return { deps, execute, logger };
};

describe('buildAutoScheduleHandlers', () => {
	it('returns one EventHandler per config entry', () => {
		const { deps } = buildDeps();
		const configs: AutoScheduleConfig[] = [
			{
				event: 'FakeEntityLinked',
				schedule: {
					providerId: 'fake',
					endpointId: 'fake-endpoint',
					cron: '0 5 * * *',
					systemParamKey: 'entityId',
					paramsBuilder: (e) => ({ q: (e as FakeEvent).entityId }),
					systemParamsBuilder: (e) => ({
						organizationId: (e as FakeEvent).organizationId,
						entityId: (e as FakeEvent).entityId,
					}),
				},
			},
		];
		const handlers = buildAutoScheduleHandlers(deps, configs);
		expect(handlers).toHaveLength(1);
		const [handler] = handlers;
		if (!handler) throw new Error('expected one handler');
		expect(handler.events).toEqual(['FakeEntityLinked']);
	});

	it('handler ignores events of other types', async () => {
		const { deps, execute } = buildDeps();
		const handlers = buildAutoScheduleHandlers(deps, [
			{
				event: 'FakeEntityLinked',
				schedule: {
					providerId: 'fake',
					endpointId: 'fake-endpoint',
					cron: '0 5 * * *',
					systemParamKey: 'entityId',
					paramsBuilder: () => ({}),
					systemParamsBuilder: () => ({ entityId: 'x' }),
				},
			},
		]);
		const [handler] = handlers;
		if (!handler) throw new Error('expected one handler');
		await handler.handle({
			type: 'OtherEvent',
			occurredAt: new Date(),
		} as unknown as SharedKernel.DomainEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('single-schedule case dispatches once with idempotencyKey', async () => {
		const { deps, execute } = buildDeps();
		const handlers = buildAutoScheduleHandlers(deps, [
			{
				event: 'FakeEntityLinked',
				schedule: {
					providerId: 'fake',
					endpointId: 'fake-endpoint',
					cron: '0 5 * * *',
					systemParamKey: 'entityId',
					paramsBuilder: (e) => ({ q: (e as FakeEvent).entityId }),
					systemParamsBuilder: (e) => ({
						organizationId: (e as FakeEvent).organizationId,
						entityId: (e as FakeEvent).entityId,
					}),
				},
			},
		]);
		const [handler] = handlers;
		if (!handler) throw new Error('expected one handler');
		await handler.handle(fakeEvent());
		expect(execute).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledWith({
			projectId: 'project-1',
			providerId: 'fake',
			endpointId: 'fake-endpoint',
			params: { q: 'fake-id' },
			systemParams: { organizationId: 'org-1', entityId: 'fake-id' },
			cron: '0 5 * * *',
			credentialOverrideId: null,
			idempotencyKey: { systemParamKey: 'entityId', systemParamValue: 'fake-id' },
		});
	});

	it('multi-schedule case fans out and Promise.all-isolates failures', async () => {
		const { deps, execute, logger } = buildDeps();
		execute.mockReset();
		execute.mockRejectedValueOnce(new Error('s1 down'));
		execute.mockResolvedValueOnce({ definitionId: 'def-s2' });
		const handlers = buildAutoScheduleHandlers(deps, [
			{
				event: 'FakeEntityLinked',
				schedules: [
					{
						providerId: 'fake',
						endpointId: 'endpoint-1',
						cron: '0 5 * * *',
						systemParamKey: 'entityId',
						paramsBuilder: () => ({}),
						systemParamsBuilder: (e) => ({ entityId: (e as FakeEvent).entityId }),
					},
					{
						providerId: 'fake',
						endpointId: 'endpoint-2',
						cron: '0 5 * * *',
						systemParamKey: 'entityId',
						paramsBuilder: () => ({}),
						systemParamsBuilder: (e) => ({ entityId: (e as FakeEvent).entityId }),
					},
				],
			},
		]);
		const [handler] = handlers;
		if (!handler) throw new Error('expected one handler');
		await handler.handle(fakeEvent());
		expect(execute).toHaveBeenCalledTimes(2);
		expect(logger.error).toHaveBeenCalledOnce();
	});

	it('dynamicSchedules resolves the schedule list at handle-time', async () => {
		const { deps, execute } = buildDeps();
		const handlers = buildAutoScheduleHandlers(deps, [
			{
				event: 'FakeEntityLinked',
				dynamicSchedules: async () => [
					{
						providerId: 'fake',
						endpointId: 'd-endpoint',
						cron: '0 5 * * *',
						systemParamKey: 'entityId',
						paramsBuilder: () => ({}),
						systemParamsBuilder: (e) => ({ entityId: (e as FakeEvent).entityId }),
					},
				],
			},
		]);
		const [handler] = handlers;
		if (!handler) throw new Error('expected one handler');
		await handler.handle(fakeEvent());
		expect(execute).toHaveBeenCalledOnce();
	});
});
