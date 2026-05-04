import { ConflictError, InvalidInputError } from '@rankpulse/shared';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { ProviderJobScheduled } from '../events/provider-job-scheduled.js';
import type { CronExpression } from '../value-objects/cron-expression.js';
import type { EndpointId } from '../value-objects/endpoint-id.js';
import type { ProviderCredentialId, ProviderJobDefinitionId } from '../value-objects/identifiers.js';
import type { ProviderId } from '../value-objects/provider-id.js';

export interface ProviderJobDefinitionProps {
	id: ProviderJobDefinitionId;
	projectId: ProjectId;
	providerId: ProviderId;
	endpointId: EndpointId;
	params: Readonly<Record<string, unknown>>;
	cron: CronExpression;
	credentialOverrideId: ProviderCredentialId | null;
	enabled: boolean;
	lastRunAt: Date | null;
	createdAt: Date;
}

/**
 * Recurring fetch definition: a (project, provider, endpoint, params) tuple
 * scheduled on a cron, optionally pinned to a specific credential. When
 * `credentialOverrideId` is null the application layer resolves the most
 * specific matching credential at run time.
 */
export class ProviderJobDefinition extends AggregateRoot {
	private constructor(private props: ProviderJobDefinitionProps) {
		super();
	}

	static schedule(input: {
		id: ProviderJobDefinitionId;
		projectId: ProjectId;
		providerId: ProviderId;
		endpointId: EndpointId;
		params: Record<string, unknown>;
		cron: CronExpression;
		credentialOverrideId?: ProviderCredentialId | null;
		now: Date;
	}): ProviderJobDefinition {
		const job = new ProviderJobDefinition({
			id: input.id,
			projectId: input.projectId,
			providerId: input.providerId,
			endpointId: input.endpointId,
			params: Object.freeze({ ...input.params }),
			cron: input.cron,
			credentialOverrideId: input.credentialOverrideId ?? null,
			enabled: true,
			lastRunAt: null,
			createdAt: input.now,
		});
		job.record(
			new ProviderJobScheduled({
				definitionId: input.id,
				projectId: input.projectId,
				providerId: input.providerId.value,
				endpointId: input.endpointId.value,
				cron: input.cron.value,
				occurredAt: input.now,
			}),
		);
		return job;
	}

	static rehydrate(props: ProviderJobDefinitionProps): ProviderJobDefinition {
		return new ProviderJobDefinition({ ...props, params: Object.freeze({ ...props.params }) });
	}

	disable(): void {
		if (!this.props.enabled) return;
		this.props = { ...this.props, enabled: false };
	}

	enable(): void {
		if (this.props.enabled) return;
		this.props = { ...this.props, enabled: true };
	}

	markRan(now: Date): void {
		if (this.props.lastRunAt && this.props.lastRunAt.getTime() > now.getTime()) {
			throw new ConflictError('lastRunAt cannot move backwards');
		}
		this.props = { ...this.props, lastRunAt: now };
	}

	updateCron(cron: CronExpression): void {
		this.props = { ...this.props, cron };
	}

	updateParams(params: Record<string, unknown>): void {
		if (Object.keys(params).length === 0) {
			throw new InvalidInputError('Job params cannot be empty');
		}
		this.props = { ...this.props, params: Object.freeze({ ...params }) };
	}

	get id(): ProviderJobDefinitionId {
		return this.props.id;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get providerId(): ProviderId {
		return this.props.providerId;
	}
	get endpointId(): EndpointId {
		return this.props.endpointId;
	}
	get params(): Readonly<Record<string, unknown>> {
		return this.props.params;
	}
	get cron(): CronExpression {
		return this.props.cron;
	}
	get credentialOverrideId(): ProviderCredentialId | null {
		return this.props.credentialOverrideId;
	}
	get enabled(): boolean {
		return this.props.enabled;
	}
	get lastRunAt(): Date | null {
		return this.props.lastRunAt;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
}
