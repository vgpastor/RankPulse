import {
	type IdentityAccess,
	MetaAdsAttribution,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface LinkMetaPixelCommand {
	organizationId: string;
	projectId: string;
	pixelHandle: string;
	credentialId?: string | null;
}

export interface LinkMetaPixelResult {
	metaPixelId: string;
}

export class LinkMetaPixelUseCase {
	constructor(
		private readonly pixels: MetaAdsAttribution.MetaPixelRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: LinkMetaPixelCommand): Promise<LinkMetaPixelResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const handle = MetaAdsAttribution.MetaPixelHandle.create(cmd.pixelHandle);
		const existing = await this.pixels.findByProjectAndHandle(projectId, handle.value);
		if (existing?.isActive()) {
			throw new ConflictError(`Meta pixel ${handle.value} is already linked to this project`);
		}

		const id = this.ids.generate() as MetaAdsAttribution.MetaPixelId;
		const pixel = MetaAdsAttribution.MetaPixel.link({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			pixelHandle: handle.value,
			credentialId: cmd.credentialId ?? null,
			now: this.clock.now(),
		});
		await this.pixels.save(pixel);
		await this.events.publish(pixel.pullEvents());
		return { metaPixelId: id };
	}
}
