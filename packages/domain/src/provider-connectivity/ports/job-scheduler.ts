import type { ProviderJobDefinition } from '../entities/provider-job-definition.js';

/**
 * Adapter port over BullMQ's Job Schedulers. Implementations register cron
 * triggers that emit fetch jobs for the worker to consume — one scheduler per
 * definition, keyed by `definition.id`, so definitions that share a provider +
 * cron never collapse onto one schedule (issue #194).
 *
 * {@link unregister} takes the full definition (not just an id) to keep the
 * port symmetric with {@link register}; implementations only need the id.
 */
export interface JobScheduler {
	register(definition: ProviderJobDefinition): Promise<void>;
	unregister(definition: ProviderJobDefinition): Promise<void>;
	enqueueOnce(definition: ProviderJobDefinition, runId: string): Promise<void>;
}
