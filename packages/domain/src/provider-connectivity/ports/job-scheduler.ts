import type { ProviderJobDefinition } from '../entities/provider-job-definition.js';

/**
 * Adapter port over BullMQ's repeatable jobs. Implementations register cron
 * triggers that emit fetch jobs for the worker to consume.
 *
 * Note that {@link unregister} takes the full definition (not just an id):
 * BullMQ's `removeRepeatable` reads the cron pattern + job options from the
 * arguments to identify which repeatable to drop, so the caller must hand
 * back what was originally scheduled.
 */
export interface JobScheduler {
	register(definition: ProviderJobDefinition): Promise<void>;
	unregister(definition: ProviderJobDefinition): Promise<void>;
	enqueueOnce(definition: ProviderJobDefinition, runId: string): Promise<void>;
}
