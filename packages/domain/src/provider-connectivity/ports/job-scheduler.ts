import type { ProviderJobDefinition } from '../entities/provider-job-definition.js';

/**
 * Adapter port over BullMQ's repeatable jobs. Implementations register cron
 * triggers that emit fetch jobs for the worker to consume.
 */
export interface JobScheduler {
	register(definition: ProviderJobDefinition): Promise<void>;
	unregister(definitionId: string): Promise<void>;
	enqueueOnce(definitionId: string, runId: string): Promise<void>;
}
