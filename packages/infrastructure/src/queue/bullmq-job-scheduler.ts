import type { ProviderConnectivity } from '@rankpulse/domain';
import { type ConnectionOptions, Queue } from 'bullmq';

export const PROVIDER_FETCH_JOB = 'provider-fetch';

export interface ProviderFetchJobData {
	definitionId: string;
	runId?: string;
}

// BullMQ rejects queue names that contain ':' (it uses ':' internally as a key
// separator inside Redis). Use '-' as the visible separator instead.
const queueNameFor = (providerId: string): string => `provider-${providerId}`;

export interface BullMqSchedulerOptions {
	connection: ConnectionOptions;
}

/**
 * Adapter implementing the JobScheduler port over BullMQ. One repeatable job
 * per ProviderJobDefinition; one queue per provider so we can apply
 * vendor-specific rate limits on the worker side.
 */
export class BullMqJobScheduler implements ProviderConnectivity.JobScheduler {
	private readonly connection: ConnectionOptions;
	private readonly queues = new Map<string, Queue>();

	constructor(options: BullMqSchedulerOptions) {
		this.connection = options.connection;
	}

	async register(definition: ProviderConnectivity.ProviderJobDefinition): Promise<void> {
		if (!definition.enabled) {
			await this.unregister(definition);
			return;
		}
		const queue = this.queueFor(definition.providerId.value);
		const data: ProviderFetchJobData = { definitionId: definition.id };
		await queue.add(PROVIDER_FETCH_JOB, data, {
			repeat: this.repeatOptsFor(definition),
			removeOnComplete: { count: 100 },
			removeOnFail: { count: 500 },
		});
	}

	async unregister(definition: ProviderConnectivity.ProviderJobDefinition): Promise<void> {
		const queue = this.queueFor(definition.providerId.value);
		await queue.removeRepeatable(PROVIDER_FETCH_JOB, this.repeatOptsFor(definition));
	}

	async enqueueOnce(definition: ProviderConnectivity.ProviderJobDefinition, runId: string): Promise<void> {
		const queue = this.queueFor(definition.providerId.value);
		const data: ProviderFetchJobData = { definitionId: definition.id, runId };
		await queue.add(PROVIDER_FETCH_JOB, data, {
			jobId: `manual-${runId}`,
			removeOnComplete: { count: 100 },
			removeOnFail: { count: 500 },
		});
	}

	private repeatOptsFor(definition: ProviderConnectivity.ProviderJobDefinition): { pattern: string } {
		// BullMQ identifies a repeatable by the hash of (name + opts). Pass only
		// the cron pattern so register/unregister produce the same hash for the
		// same definition.
		return { pattern: definition.cron.value };
	}

	getQueue(providerId: string): Queue {
		return this.queueFor(providerId);
	}

	async close(): Promise<void> {
		await Promise.all([...this.queues.values()].map((q) => q.close()));
	}

	private queueFor(providerId: string): Queue {
		const name = queueNameFor(providerId);
		const existing = this.queues.get(name);
		if (existing) return existing;
		const queue = new Queue<ProviderFetchJobData>(name, { connection: this.connection });
		this.queues.set(name, queue);
		return queue;
	}
}

export { queueNameFor as providerQueueName };
