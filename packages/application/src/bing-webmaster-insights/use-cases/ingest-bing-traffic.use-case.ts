import { BingWebmasterInsights, type SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface BingTrafficRowInput {
	observedDate: string; // YYYY-MM-DD
	clicks: number;
	impressions: number;
	avgClickPosition: number | null;
	avgImpressionPosition: number | null;
}

export interface IngestBingTrafficCommand {
	bingPropertyId: string;
	rows: readonly BingTrafficRowInput[];
	rawPayloadId: string | null;
}

export interface IngestBingTrafficResult {
	ingested: number;
}

/**
 * Persists Bing daily-traffic rows for a linked property and publishes one
 * summary event with totals. Mirrors the GSC / GA4 ingest patterns:
 * onConflictDoNothing on the natural key (propertyId, observedDate) so a
 * 6-month re-fetch is a no-op for already-stored days.
 */
export class IngestBingTrafficUseCase {
	constructor(
		private readonly properties: BingWebmasterInsights.BingPropertyRepository,
		private readonly observations: BingWebmasterInsights.BingTrafficObservationRepository,
		private readonly events: SharedKernel.EventPublisher,
		private readonly clock: Clock,
	) {}

	async execute(cmd: IngestBingTrafficCommand): Promise<IngestBingTrafficResult> {
		if (cmd.rows.length === 0) return { ingested: 0 };

		const property = await this.properties.findById(
			cmd.bingPropertyId as BingWebmasterInsights.BingPropertyId,
		);
		if (!property) throw new NotFoundError(`BingProperty ${cmd.bingPropertyId} not found`);
		if (!property.isActive()) return { ingested: 0 };

		let totalClicks = 0;
		let totalImpressions = 0;
		const observations = cmd.rows.map((row) => {
			totalClicks += row.clicks;
			totalImpressions += row.impressions;
			return BingWebmasterInsights.BingTrafficObservation.record({
				bingPropertyId: property.id,
				projectId: property.projectId,
				observedDate: row.observedDate,
				metrics: BingWebmasterInsights.BingTrafficMetrics.create({
					clicks: row.clicks,
					impressions: row.impressions,
					avgClickPosition: row.avgClickPosition,
					avgImpressionPosition: row.avgImpressionPosition,
				}),
				rawPayloadId: cmd.rawPayloadId,
			});
		});

		const { inserted } = await this.observations.saveAll(observations);

		await this.events.publish([
			new BingWebmasterInsights.BingTrafficBatchIngested({
				projectId: property.projectId,
				bingPropertyId: property.id,
				rowsCount: inserted,
				totalClicks,
				totalImpressions,
				occurredAt: this.clock.now(),
			}),
		]);

		return { ingested: inserted };
	}
}
