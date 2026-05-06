import { MetaAdsAttribution, type SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface MetaPixelEventInput {
	observedDate: string; // YYYY-MM-DD
	eventName: string;
	count: number;
	valueSum: number;
}

export interface IngestMetaPixelEventsCommand {
	metaPixelId: string;
	rows: readonly MetaPixelEventInput[];
	rawPayloadId: string | null;
}

export interface IngestMetaPixelEventsResult {
	ingested: number;
}

/**
 * Persists a batch of daily pixel-event aggregates and publishes one
 * summary event with totals (mirroring the GA4/GSC ingest shape). The
 * natural PK is `(meta_pixel_id, observed_date, event_name)`; the repo
 * does `onConflictDoNothing`, so a retry of the same window with the
 * same event set reports zero ingestion.
 */
export class IngestMetaPixelEventsUseCase {
	constructor(
		private readonly pixels: MetaAdsAttribution.MetaPixelRepository,
		private readonly events: MetaAdsAttribution.MetaPixelEventDailyRepository,
		private readonly publisher: SharedKernel.EventPublisher,
		private readonly clock: Clock,
	) {}

	async execute(cmd: IngestMetaPixelEventsCommand): Promise<IngestMetaPixelEventsResult> {
		if (cmd.rows.length === 0) return { ingested: 0 };

		const pixel = await this.pixels.findById(cmd.metaPixelId as MetaAdsAttribution.MetaPixelId);
		if (!pixel) throw new NotFoundError(`MetaPixel ${cmd.metaPixelId} not found`);
		if (!pixel.isActive()) return { ingested: 0 };

		const aggregates = cmd.rows.map((row) =>
			MetaAdsAttribution.MetaPixelEventDaily.record({
				metaPixelId: pixel.id,
				projectId: pixel.projectId,
				observedDate: row.observedDate,
				eventName: row.eventName,
				stats: MetaAdsAttribution.MetaPixelEventStats.create({
					count: row.count,
					valueSum: row.valueSum,
				}),
				rawPayloadId: cmd.rawPayloadId,
			}),
		);

		const { inserted } = await this.events.saveAll(aggregates);

		const totals = cmd.rows.reduce(
			(acc, row) => ({
				count: acc.count + row.count,
				value: acc.value + row.valueSum,
			}),
			{ count: 0, value: 0 },
		);

		await this.publisher.publish([
			new MetaAdsAttribution.MetaPixelEventsBatchIngested({
				projectId: pixel.projectId,
				metaPixelId: pixel.id,
				rowsCount: inserted,
				totalEvents: totals.count,
				totalValueSum: totals.value,
				occurredAt: this.clock.now(),
			}),
		]);

		return { ingested: inserted };
	}
}
