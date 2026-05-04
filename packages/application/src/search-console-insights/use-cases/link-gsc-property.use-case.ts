import {
	type IdentityAccess,
	type ProjectManagement,
	SearchConsoleInsights,
	type SharedKernel,
} from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface LinkGscPropertyCommand {
	organizationId: string;
	projectId: string;
	siteUrl: string;
	propertyType: SearchConsoleInsights.GscPropertyType;
	credentialId?: string | null;
}

export interface LinkGscPropertyResult {
	gscPropertyId: string;
}

export class LinkGscPropertyUseCase {
	constructor(
		private readonly properties: SearchConsoleInsights.GscPropertyRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: LinkGscPropertyCommand): Promise<LinkGscPropertyResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const existing = await this.properties.findByProjectAndSite(projectId, cmd.siteUrl);
		if (existing?.isActive()) {
			throw new ConflictError(`GSC property ${cmd.siteUrl} already linked to this project`);
		}

		const id = this.ids.generate() as SearchConsoleInsights.GscPropertyId;
		const property = SearchConsoleInsights.GscProperty.link({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			siteUrl: cmd.siteUrl,
			propertyType: cmd.propertyType,
			credentialId: cmd.credentialId ?? null,
			now: this.clock.now(),
		});
		await this.properties.save(property);
		await this.events.publish(property.pullEvents());
		return { gscPropertyId: id };
	}
}
