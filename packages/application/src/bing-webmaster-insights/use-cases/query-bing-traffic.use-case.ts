import type { BingWebmasterInsights } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryBingTrafficCommand {
	bingPropertyId: string;
	from: string; // YYYY-MM-DD inclusive
	to: string; // YYYY-MM-DD inclusive
}

export interface BingTrafficView {
	observedDate: string;
	clicks: number;
	impressions: number;
	avgClickPosition: number | null;
	avgImpressionPosition: number | null;
}

export class QueryBingTrafficUseCase {
	constructor(
		private readonly properties: BingWebmasterInsights.BingPropertyRepository,
		private readonly observations: BingWebmasterInsights.BingTrafficObservationRepository,
	) {}

	async execute(cmd: QueryBingTrafficCommand): Promise<readonly BingTrafficView[]> {
		const property = await this.properties.findById(
			cmd.bingPropertyId as BingWebmasterInsights.BingPropertyId,
		);
		if (!property) throw new NotFoundError(`BingProperty ${cmd.bingPropertyId} not found`);
		const rows = await this.observations.listForProperty(property.id, { from: cmd.from, to: cmd.to });
		return rows.map((r) => ({
			observedDate: r.observedDate,
			clicks: r.metrics.clicks,
			impressions: r.metrics.impressions,
			avgClickPosition: r.metrics.avgClickPosition,
			avgImpressionPosition: r.metrics.avgImpressionPosition,
		}));
	}
}
