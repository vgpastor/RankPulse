import {
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
	TrafficAnalytics,
} from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface LinkGa4PropertyCommand {
	organizationId: string;
	projectId: string;
	propertyHandle: string;
	credentialId?: string | null;
}

export interface LinkGa4PropertyResult {
	ga4PropertyId: string;
}

export class LinkGa4PropertyUseCase {
	constructor(
		private readonly properties: TrafficAnalytics.Ga4PropertyRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: LinkGa4PropertyCommand): Promise<LinkGa4PropertyResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		// Canonicalise the handle once so the lookup matches the row we'd write.
		const handle = TrafficAnalytics.Ga4PropertyHandle.create(cmd.propertyHandle);
		const existing = await this.properties.findByProjectAndHandle(projectId, handle.value);
		if (existing?.isActive()) {
			throw new ConflictError(`GA4 property ${handle.value} is already linked to this project`);
		}

		const id = this.ids.generate() as TrafficAnalytics.Ga4PropertyId;
		const property = TrafficAnalytics.Ga4Property.link({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			propertyHandle: handle.value,
			credentialId: cmd.credentialId ?? null,
			now: this.clock.now(),
		});
		await this.properties.save(property);
		await this.events.publish(property.pullEvents());
		return { ga4PropertyId: id };
	}
}
