import { ProviderConnectivity } from '@rankpulse/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The mock models BullMQ's Job Scheduler identity: schedulers are keyed by
// their `jobSchedulerId`. Two upserts with the same id update one entry;
// different ids coexist. This is exactly the dedup semantics that issue #194
// violated — the previous code registered repeatables with NO per-definition
// id, so every definition sharing a provider + cron collapsed onto a single
// cron-keyed repeatable (prod: 15 GSC defs on "0 5 * * *" => 1 repeatable).
const schedulers = new Map<string, { repeat: unknown; template: unknown }>();
const queueAdd = vi.fn(async () => {});
const upsertJobScheduler = vi.fn(async (id: string, repeat: unknown, template: unknown) => {
	schedulers.set(id, { repeat, template });
});
const removeJobScheduler = vi.fn(async (id: string) => schedulers.delete(id));
const queueClose = vi.fn(async () => {});

vi.mock('bullmq', () => ({
	Queue: class MockQueue {
		readonly name: string;
		constructor(name: string) {
			this.name = name;
		}
		add = queueAdd;
		upsertJobScheduler = upsertJobScheduler;
		removeJobScheduler = removeJobScheduler;
		close = queueClose;
	},
}));

const { BullMqJobScheduler, providerQueueName, PROVIDER_FETCH_JOB } = await import(
	'./bullmq-job-scheduler.js'
);

const buildDefinition = (
	overrides: Partial<{ id: string; providerId: string; cron: string }> = {},
): ProviderConnectivity.ProviderJobDefinition =>
	ProviderConnectivity.ProviderJobDefinition.schedule({
		id: (overrides.id ?? 'def-1') as ProviderConnectivity.ProviderJobDefinitionId,
		projectId: 'proj-1' as never,
		providerId: ProviderConnectivity.ProviderId.create(overrides.providerId ?? 'dataforseo'),
		endpointId: ProviderConnectivity.EndpointId.create('serp-google-organic-live'),
		params: { keyword: 'k', locationCode: 2724, languageCode: 'es', device: 'desktop' },
		cron: ProviderConnectivity.CronExpression.create(overrides.cron ?? '0 6 * * 1'),
		credentialOverrideId: null,
		now: new Date('2026-05-04T00:00:00Z'),
	});

const connection = { host: 'localhost', port: 6379 };

beforeEach(() => {
	schedulers.clear();
	queueAdd.mockClear();
	upsertJobScheduler.mockClear();
	removeJobScheduler.mockClear();
});

describe('BullMqJobScheduler', () => {
	it('queue name uses "-" as separator (BullMQ rejects ":" in queue names)', () => {
		expect(providerQueueName('dataforseo')).toBe('provider-dataforseo');
		expect(providerQueueName('dataforseo')).not.toContain(':');
	});

	it('enqueueOnce uses jobId of shape "manual-<runId>", never with ":" (BACKLOG #6)', async () => {
		const scheduler = new BullMqJobScheduler({ connection });

		await scheduler.enqueueOnce(buildDefinition(), 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

		expect(queueAdd).toHaveBeenCalledTimes(1);
		const opts = (queueAdd.mock.calls[0] as unknown as [string, unknown, { jobId: string }])[2];
		expect(opts.jobId).toBe('manual-aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
		expect(opts.jobId).not.toContain(':');
	});

	it('register upserts a Job Scheduler keyed by the definition id', async () => {
		const scheduler = new BullMqJobScheduler({ connection });

		await scheduler.register(buildDefinition({ id: 'def-A', cron: '0 12 * * *' }));

		expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
		const [id, repeat, template] = upsertJobScheduler.mock.calls[0] as unknown as [
			string,
			{ pattern: string },
			{ name: string; data: { definitionId: string } },
		];
		expect(id).toBe('def-A');
		expect(repeat).toEqual({ pattern: '0 12 * * *' });
		expect(template.name).toBe(PROVIDER_FETCH_JOB);
		expect(template.data).toEqual({ definitionId: 'def-A' });
	});

	it('does NOT collapse two definitions that share provider + cron (regression #194)', async () => {
		const scheduler = new BullMqJobScheduler({ connection });

		// Same provider, same cron, different definition ids — the exact shape
		// that froze EN/FR/MX: many GSC defs on "0 5 * * *" collapsed to one
		// repeatable, so only one ran per day.
		await scheduler.register(
			buildDefinition({ id: 'def-A', providerId: 'google-search-console', cron: '0 5 * * *' }),
		);
		await scheduler.register(
			buildDefinition({ id: 'def-B', providerId: 'google-search-console', cron: '0 5 * * *' }),
		);

		expect(schedulers.size).toBe(2);
		expect([...schedulers.keys()].sort()).toEqual(['def-A', 'def-B']);
	});

	it('unregister removes the Job Scheduler by definition id', async () => {
		const scheduler = new BullMqJobScheduler({ connection });

		await scheduler.register(buildDefinition({ id: 'def-A' }));
		await scheduler.unregister(buildDefinition({ id: 'def-A' }));

		expect(removeJobScheduler).toHaveBeenCalledWith('def-A');
		expect(schedulers.size).toBe(0);
	});

	it('register on a disabled definition unregisters instead of scheduling', async () => {
		const scheduler = new BullMqJobScheduler({ connection });
		const def = buildDefinition();
		def.disable();

		await scheduler.register(def);

		expect(upsertJobScheduler).not.toHaveBeenCalled();
		expect(removeJobScheduler).toHaveBeenCalledTimes(1);
	});

	it('caches the Queue instance per provider — no new queue on repeated calls', async () => {
		const scheduler = new BullMqJobScheduler({ connection });

		await scheduler.enqueueOnce(buildDefinition(), 'run-1');
		await scheduler.enqueueOnce(buildDefinition(), 'run-2');

		expect(scheduler.getQueue('dataforseo')).toBe(scheduler.getQueue('dataforseo'));
		expect(queueAdd).toHaveBeenCalledTimes(2);
	});
});
