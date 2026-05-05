import type { BingWebmasterInsights } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface UnlinkBingPropertyCommand {
	bingPropertyId: string;
}

export class UnlinkBingPropertyUseCase {
	constructor(
		private readonly properties: BingWebmasterInsights.BingPropertyRepository,
		private readonly clock: Clock,
	) {}

	async execute(cmd: UnlinkBingPropertyCommand): Promise<void> {
		const property = await this.properties.findById(
			cmd.bingPropertyId as BingWebmasterInsights.BingPropertyId,
		);
		if (!property) throw new NotFoundError(`BingProperty ${cmd.bingPropertyId} not found`);
		if (!property.isActive()) return; // idempotent
		property.unlink(this.clock.now());
		await this.properties.save(property);
	}
}
