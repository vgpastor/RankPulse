import type { MetaAdsAttribution } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface UnlinkMetaPixelCommand {
	metaPixelId: string;
}

export class UnlinkMetaPixelUseCase {
	constructor(
		private readonly pixels: MetaAdsAttribution.MetaPixelRepository,
		private readonly clock: Clock,
	) {}

	async execute(cmd: UnlinkMetaPixelCommand): Promise<void> {
		const pixel = await this.pixels.findById(cmd.metaPixelId as MetaAdsAttribution.MetaPixelId);
		if (!pixel) throw new NotFoundError(`MetaPixel ${cmd.metaPixelId} not found`);
		if (!pixel.isActive()) return;
		pixel.unlink(this.clock.now());
		await this.pixels.save(pixel);
	}
}
