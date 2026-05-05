import type { TrafficAnalytics } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface UnlinkGa4PropertyCommand {
	ga4PropertyId: string;
}

export class UnlinkGa4PropertyUseCase {
	constructor(
		private readonly properties: TrafficAnalytics.Ga4PropertyRepository,
		private readonly clock: Clock,
	) {}

	async execute(cmd: UnlinkGa4PropertyCommand): Promise<void> {
		const property = await this.properties.findById(cmd.ga4PropertyId as TrafficAnalytics.Ga4PropertyId);
		if (!property) {
			throw new NotFoundError(`Ga4Property ${cmd.ga4PropertyId} not found`);
		}
		if (!property.isActive()) return; // idempotent
		property.unlink(this.clock.now());
		await this.properties.save(property);
	}
}
