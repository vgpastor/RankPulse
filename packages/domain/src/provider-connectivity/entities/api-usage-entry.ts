import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { ApiUsageRecorded } from '../events/api-usage-recorded.js';
import type { CostUnit } from '../value-objects/cost-unit.js';
import type { EndpointId } from '../value-objects/endpoint-id.js';
import type { ApiUsageEntryId, ProviderCredentialId } from '../value-objects/identifiers.js';
import type { ProviderId } from '../value-objects/provider-id.js';

export interface ApiUsageEntryProps {
	id: ApiUsageEntryId;
	organizationId: OrganizationId;
	credentialId: ProviderCredentialId;
	projectId: ProjectId | null;
	providerId: ProviderId;
	endpointId: EndpointId;
	calls: number;
	cost: CostUnit;
	occurredAt: Date;
}

/**
 * Append-only ledger row recording cost attributable to a credential / project.
 * Aggregations (per-day, per-month) are computed via SQL views, not stored.
 */
export class ApiUsageEntry extends AggregateRoot {
	private constructor(private readonly props: ApiUsageEntryProps) {
		super();
	}

	static record(input: {
		id: ApiUsageEntryId;
		organizationId: OrganizationId;
		credentialId: ProviderCredentialId;
		projectId: ProjectId | null;
		providerId: ProviderId;
		endpointId: EndpointId;
		calls: number;
		cost: CostUnit;
		now: Date;
	}): ApiUsageEntry {
		const entry = new ApiUsageEntry({
			id: input.id,
			organizationId: input.organizationId,
			credentialId: input.credentialId,
			projectId: input.projectId,
			providerId: input.providerId,
			endpointId: input.endpointId,
			calls: Math.max(1, Math.floor(input.calls)),
			cost: input.cost,
			occurredAt: input.now,
		});
		entry.record(
			new ApiUsageRecorded({
				usageId: input.id,
				organizationId: input.organizationId,
				credentialId: input.credentialId,
				projectId: input.projectId,
				providerId: input.providerId.value,
				endpointId: input.endpointId.value,
				costCents: input.cost.cents,
				occurredAt: input.now,
			}),
		);
		return entry;
	}

	static rehydrate(props: ApiUsageEntryProps): ApiUsageEntry {
		return new ApiUsageEntry(props);
	}

	get id(): ApiUsageEntryId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get credentialId(): ProviderCredentialId {
		return this.props.credentialId;
	}
	get projectId(): ProjectId | null {
		return this.props.projectId;
	}
	get providerId(): ProviderId {
		return this.props.providerId;
	}
	get endpointId(): EndpointId {
		return this.props.endpointId;
	}
	get calls(): number {
		return this.props.calls;
	}
	get cost(): CostUnit {
		return this.props.cost;
	}
	get occurredAt(): Date {
		return this.props.occurredAt;
	}
}
