import {
	BingWebmasterInsights,
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface LinkBingPropertyCommand {
	organizationId: string;
	projectId: string;
	siteUrl: string;
	credentialId?: string | null;
}

export interface LinkBingPropertyResult {
	bingPropertyId: string;
}

export class LinkBingPropertyUseCase {
	constructor(
		private readonly properties: BingWebmasterInsights.BingPropertyRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: LinkBingPropertyCommand): Promise<LinkBingPropertyResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const existing = await this.properties.findByProjectAndSite(projectId, cmd.siteUrl);
		if (existing?.isActive()) {
			throw new ConflictError(`Bing property ${cmd.siteUrl} already linked to this project`);
		}

		const id = this.ids.generate() as BingWebmasterInsights.BingPropertyId;
		const property = BingWebmasterInsights.BingProperty.link({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			siteUrl: cmd.siteUrl,
			credentialId: cmd.credentialId ?? null,
			now: this.clock.now(),
		});
		await this.properties.save(property);
		await this.events.publish(property.pullEvents());
		return { bingPropertyId: id };
	}
}
