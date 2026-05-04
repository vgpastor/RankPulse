import {
	type IdentityAccess,
	type ProjectManagement,
	ProviderConnectivity,
	type SharedKernel,
} from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';

export interface RecordApiUsageCommand {
	organizationId: string;
	credentialId: string;
	projectId: string | null;
	providerId: string;
	endpointId: string;
	calls: number;
	costCents: number;
}

export class RecordApiUsageUseCase {
	constructor(
		private readonly usage: ProviderConnectivity.ApiUsageRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: RecordApiUsageCommand): Promise<{ usageId: string }> {
		const id = this.ids.generate() as ProviderConnectivity.ApiUsageEntryId;
		const entry = ProviderConnectivity.ApiUsageEntry.record({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			credentialId: cmd.credentialId as ProviderConnectivity.ProviderCredentialId,
			projectId: cmd.projectId ? (cmd.projectId as ProjectManagement.ProjectId) : null,
			providerId: ProviderConnectivity.ProviderId.create(cmd.providerId),
			endpointId: ProviderConnectivity.EndpointId.create(cmd.endpointId),
			calls: cmd.calls,
			cost: ProviderConnectivity.CostUnit.fromCents(cmd.costCents),
			now: this.clock.now(),
		});
		await this.usage.save(entry);
		await this.events.publish(entry.pullEvents());
		return { usageId: id };
	}
}
