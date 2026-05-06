import type { MetaAdsAttribution } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryMetaPixelEventsCommand {
	metaPixelId: string;
	from: string;
	to: string;
}

export interface MetaPixelEventDailyView {
	observedDate: string;
	eventName: string;
	count: number;
	valueSum: number;
}

export class QueryMetaPixelEventsUseCase {
	constructor(
		private readonly pixels: MetaAdsAttribution.MetaPixelRepository,
		private readonly events: MetaAdsAttribution.MetaPixelEventDailyRepository,
	) {}

	async execute(cmd: QueryMetaPixelEventsCommand): Promise<readonly MetaPixelEventDailyView[]> {
		const pixel = await this.pixels.findById(cmd.metaPixelId as MetaAdsAttribution.MetaPixelId);
		if (!pixel) throw new NotFoundError(`MetaPixel ${cmd.metaPixelId} not found`);
		const rows = await this.events.listForPixel(pixel.id, { from: cmd.from, to: cmd.to });
		return rows.map((r) => ({
			observedDate: r.observedDate,
			eventName: r.eventName,
			count: r.stats.count,
			valueSum: r.stats.valueSum,
		}));
	}
}
