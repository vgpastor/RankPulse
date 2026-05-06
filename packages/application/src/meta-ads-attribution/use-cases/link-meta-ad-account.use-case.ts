import {
	type IdentityAccess,
	MetaAdsAttribution,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface LinkMetaAdAccountCommand {
	organizationId: string;
	projectId: string;
	adAccountHandle: string;
	credentialId?: string | null;
}

export interface LinkMetaAdAccountResult {
	metaAdAccountId: string;
}

export class LinkMetaAdAccountUseCase {
	constructor(
		private readonly accounts: MetaAdsAttribution.MetaAdAccountRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: LinkMetaAdAccountCommand): Promise<LinkMetaAdAccountResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const handle = MetaAdsAttribution.MetaAdAccountHandle.create(cmd.adAccountHandle);
		const existing = await this.accounts.findByProjectAndHandle(projectId, handle.value);
		if (existing?.isActive()) {
			throw new ConflictError(`Meta ad account ${handle.value} is already linked to this project`);
		}

		const id = this.ids.generate() as MetaAdsAttribution.MetaAdAccountId;
		const account = MetaAdsAttribution.MetaAdAccount.link({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			adAccountHandle: handle.value,
			credentialId: cmd.credentialId ?? null,
			now: this.clock.now(),
		});
		await this.accounts.save(account);
		await this.events.publish(account.pullEvents());
		return { metaAdAccountId: id };
	}
}
