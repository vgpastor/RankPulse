import { type ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface JobDefinitionView {
	id: string;
	projectId: string;
	providerId: string;
	endpointId: string;
	params: Record<string, unknown>;
	cron: string;
	credentialOverrideId: string | null;
	enabled: boolean;
	lastRunAt: string | null;
	createdAt: string;
}

const toView = (d: ProviderConnectivity.ProviderJobDefinition): JobDefinitionView => ({
	id: d.id,
	projectId: d.projectId,
	providerId: d.providerId.value,
	endpointId: d.endpointId.value,
	params: { ...d.params },
	cron: d.cron.value,
	credentialOverrideId: d.credentialOverrideId,
	enabled: d.enabled,
	lastRunAt: d.lastRunAt ? d.lastRunAt.toISOString() : null,
	createdAt: d.createdAt.toISOString(),
});

export class ListJobDefinitionsUseCase {
	constructor(private readonly definitions: ProviderConnectivity.JobDefinitionRepository) {}

	async execute(projectId: string): Promise<JobDefinitionView[]> {
		const rows = await this.definitions.listForProject(projectId as ProjectManagement.ProjectId);
		return rows.map(toView);
	}
}

export class GetJobDefinitionUseCase {
	constructor(private readonly definitions: ProviderConnectivity.JobDefinitionRepository) {}

	async execute(definitionId: string): Promise<JobDefinitionView> {
		const def = await this.definitions.findById(definitionId as ProviderConnectivity.ProviderJobDefinitionId);
		if (!def) throw new NotFoundError(`Job definition ${definitionId} not found`);
		return toView(def);
	}
}

export interface UpdateJobDefinitionCommand {
	definitionId: string;
	cron?: string;
	params?: Record<string, unknown>;
	enabled?: boolean;
}

/**
 * Keys the controllers inject as systemParams when creating or
 * auto-scheduling a JobDefinition. Listed here (instead of inferred from
 * the existing def's params) so that adding one elsewhere fails the type
 * check until this list is updated — keeping the contract explicit.
 *
 * BACKLOG bug #51.
 */
const SYSTEM_PARAM_KEYS = ['organizationId', 'projectId', 'gscPropertyId', 'trackedKeywordId'] as const;

function mergeUserParamsPreservingSystem(
	existing: Record<string, unknown>,
	userPatch: Record<string, unknown>,
): Record<string, unknown> {
	const preserved: Record<string, unknown> = {};
	for (const key of SYSTEM_PARAM_KEYS) {
		if (existing[key] !== undefined) preserved[key] = existing[key];
	}
	// User-provided keys take precedence for non-system keys; system keys
	// from the existing def always win to prevent accidental tamper.
	return { ...userPatch, ...preserved };
}

export class UpdateJobDefinitionUseCase {
	constructor(
		private readonly definitions: ProviderConnectivity.JobDefinitionRepository,
		private readonly scheduler: ProviderConnectivity.JobScheduler,
	) {}

	async execute(cmd: UpdateJobDefinitionCommand): Promise<JobDefinitionView> {
		const def = await this.definitions.findById(
			cmd.definitionId as ProviderConnectivity.ProviderJobDefinitionId,
		);
		if (!def) throw new NotFoundError(`Job definition ${cmd.definitionId} not found`);

		// Snapshot the OLD definition so we can unregister its repeatable
		// pattern after the DB write succeeds. If we unregistered first
		// and then `save` failed, BullMQ would have no entry while the DB
		// still claimed the old cron — silent drift until the next reload.
		const snapshotBeforeUpdate = def;

		if (cmd.cron !== undefined) def.updateCron(ProviderConnectivity.CronExpression.create(cmd.cron));
		if (cmd.params !== undefined) {
			// BACKLOG bug #51 — PATCH used to REPLACE `params` wholesale,
			// silently dropping any system-injected key the controller put
			// there at create time (`organizationId`, `gscPropertyId`,
			// `trackedKeywordId`). The next worker run then failed with
			// "missing organizationId in systemParams" or similar.
			//
			// Fix: preserve the known systemParam keys from the existing
			// def and merge the user-provided patch ON TOP. The whitelist
			// is intentionally explicit — adding a new systemParam in
			// downstream code requires extending this list, which forces a
			// review of every PATCH call site.
			def.updateParams(mergeUserParamsPreservingSystem(def.params, cmd.params));
		}
		if (cmd.enabled === true) def.enable();
		if (cmd.enabled === false) def.disable();

		await this.definitions.save(def);
		// DB is now the source of truth. Swap the BullMQ entry: unregister
		// the prior pattern, register the new one. If `register` fails the
		// next worker reboot reconciles from DB; the operator just sees a
		// missing scheduled run for the upcoming tick.
		await this.scheduler.unregister(snapshotBeforeUpdate);
		await this.scheduler.register(def);
		return toView(def);
	}
}

export class DeleteJobDefinitionUseCase {
	constructor(
		private readonly definitions: ProviderConnectivity.JobDefinitionRepository,
		private readonly scheduler: ProviderConnectivity.JobScheduler,
	) {}

	async execute(definitionId: string): Promise<void> {
		const def = await this.definitions.findById(definitionId as ProviderConnectivity.ProviderJobDefinitionId);
		if (!def) throw new NotFoundError(`Job definition ${definitionId} not found`);
		await this.scheduler.unregister(def);
		await this.definitions.delete(def.id);
	}
}
