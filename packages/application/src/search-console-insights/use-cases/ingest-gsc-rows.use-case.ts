import { SearchConsoleInsights, type SharedKernel } from '@rankpulse/domain';
import { type Clock, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface GscRowInput {
	observedAt: Date;
	query: string | null;
	page: string | null;
	country: string | null;
	device: string | null;
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
}

export interface IngestGscRowsCommand {
	gscPropertyId: string;
	rows: readonly GscRowInput[];
	rawPayloadId: string | null;
}

export interface IngestGscRowsResult {
	ingested: number;
}

/**
 * Persists a batch of GSC search-analytics rows for a linked property and
 * publishes one summary integration event with the totals — alerting and
 * reporting subscribe to that rather than re-aggregating raw rows.
 */
export class IngestGscRowsUseCase {
	constructor(
		private readonly properties: SearchConsoleInsights.GscPropertyRepository,
		private readonly observations: SearchConsoleInsights.GscPerformanceObservationRepository,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
		private readonly clock: Clock,
	) {}

	async execute(cmd: IngestGscRowsCommand): Promise<IngestGscRowsResult> {
		if (cmd.rows.length === 0) {
			return { ingested: 0 };
		}
		const property = await this.properties.findById(cmd.gscPropertyId as SearchConsoleInsights.GscPropertyId);
		if (!property) {
			throw new NotFoundError(`GscProperty ${cmd.gscPropertyId} not found`);
		}
		if (!property.isActive()) {
			return { ingested: 0 };
		}

		let totalClicks = 0;
		let totalImpressions = 0;
		const observations = cmd.rows.map((row) => {
			totalClicks += row.clicks;
			totalImpressions += row.impressions;
			return SearchConsoleInsights.GscPerformanceObservation.record({
				id: this.ids.generate() as SearchConsoleInsights.GscObservationId,
				gscPropertyId: property.id,
				projectId: property.projectId,
				observedAt: row.observedAt,
				query: row.query,
				page: row.page,
				country: row.country,
				device: row.device,
				metrics: SearchConsoleInsights.PerformanceMetrics.create({
					clicks: row.clicks,
					impressions: row.impressions,
					ctr: row.ctr,
					position: row.position,
				}),
				rawPayloadId: cmd.rawPayloadId,
			});
		});

		await this.observations.saveAll(observations);

		// One summary event for the whole batch instead of N per-row events.
		// Subscribers (alerting, weekly reports) aggregate anyway, and a
		// 25k-row GSC fetch shouldn't blow up the event bus.
		await this.events.publish([
			new SearchConsoleInsights.GscPerformanceBatchIngested({
				projectId: property.projectId,
				gscPropertyId: property.id,
				rowsCount: observations.length,
				totalClicks,
				totalImpressions,
				occurredAt: this.clock.now(),
			}),
		]);

		return { ingested: observations.length };
	}
}
