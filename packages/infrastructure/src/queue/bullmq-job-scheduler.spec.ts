import { ProviderConnectivity } from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';

const queueAdd = vi.fn(async () => {});
const queueRemoveRepeatable = vi.fn(async () => {});
const queueClose = vi.fn(async () => {});

vi.mock('bullmq', () => ({
	Queue: class MockQueue {
		readonly name: string;
		constructor(name: string) {
			this.name = name;
		}
		add = queueAdd;
		removeRepeatable = queueRemoveRepeatable;
		close = queueClose;
	},
}));

const { BullMqJobScheduler, providerQueueName } = await import('./bullmq-job-scheduler.js');

const buildDefinition = (
	overrides: Partial<{ providerId: string; cron: string; enabled: boolean }> = {},
): ProviderConnectivity.ProviderJobDefinition =>
	ProviderConnectivity.ProviderJobDefinition.schedule({
		id: 'def-1' as ProviderConnectivity.ProviderJobDefinitionId,
		projectId: 'proj-1' as never,
		providerId: ProviderConnectivity.ProviderId.create(overrides.providerId ?? 'dataforseo'),
		endpointId: ProviderConnectivity.EndpointId.create('serp-google-organic-live'),
		params: { keyword: 'k', locationCode: 2724, languageCode: 'es', device: 'desktop' },
		cron: ProviderConnectivity.CronExpression.create(overrides.cron ?? '0 6 * * 1'),
		credentialOverrideId: null,
		now: new Date('2026-05-04T00:00:00Z'),
	});

describe('BullMqJobScheduler', () => {
	it('queue name uses "-" as separator (BullMQ rejects ":" in queue names)', () => {
		expect(providerQueueName('dataforseo')).toBe('provider-dataforseo');
		expect(providerQueueName('dataforseo')).not.toContain(':');
	});

	it('enqueueOnce uses jobId of shape "manual-<runId>", never with ":" (BACKLOG #6)', async () => {
		queueAdd.mockClear();
		const scheduler = new BullMqJobScheduler({ connection: { host: 'localhost', port: 6379 } });

		await scheduler.enqueueOnce(buildDefinition(), 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

		expect(queueAdd).toHaveBeenCalledTimes(1);
		const opts = (queueAdd.mock.calls[0] as unknown as [string, unknown, { jobId: string }])[2];
		expect(opts.jobId).toBe('manual-aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
		expect(opts.jobId).not.toContain(':');
	});

	it('register installs a repeatable job with the cron pattern', async () => {
		queueAdd.mockClear();
		const scheduler = new BullMqJobScheduler({ connection: { host: 'localhost', port: 6379 } });

		await scheduler.register(buildDefinition({ cron: '0 12 * * *' }));

		expect(queueAdd).toHaveBeenCalledTimes(1);
		const opts = (
			queueAdd.mock.calls[0] as unknown as [string, unknown, { repeat?: { pattern: string } }]
		)[2];
		expect(opts.repeat?.pattern).toBe('0 12 * * *');
	});

	it('register on a disabled definition unregisters instead of registering', async () => {
		queueAdd.mockClear();
		queueRemoveRepeatable.mockClear();
		const scheduler = new BullMqJobScheduler({ connection: { host: 'localhost', port: 6379 } });
		const def = buildDefinition();
		def.disable();

		await scheduler.register(def);

		expect(queueAdd).not.toHaveBeenCalled();
		expect(queueRemoveRepeatable).toHaveBeenCalledTimes(1);
	});

	it('caches the Queue instance per provider — no new queue on repeated calls', async () => {
		queueAdd.mockClear();
		const scheduler = new BullMqJobScheduler({ connection: { host: 'localhost', port: 6379 } });

		await scheduler.enqueueOnce(buildDefinition(), 'run-1');
		await scheduler.enqueueOnce(buildDefinition(), 'run-2');

		expect(scheduler.getQueue('dataforseo')).toBe(scheduler.getQueue('dataforseo'));
		expect(queueAdd).toHaveBeenCalledTimes(2);
	});
});
