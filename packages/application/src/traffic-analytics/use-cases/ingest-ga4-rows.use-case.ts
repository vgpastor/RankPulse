import { createHash } from 'node:crypto';
import { type SharedKernel, TrafficAnalytics } from '@rankpulse/domain';
import { type Clock, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface Ga4RowInput {
	observedDate: string; // YYYY-MM-DD
	dimensions: Record<string, string>;
	metrics: Record<string, number>;
}

export interface IngestGa4RowsCommand {
	ga4PropertyId: string;
	rows: readonly Ga4RowInput[];
	rawPayloadId: string | null;
}

export interface IngestGa4RowsResult {
	ingested: number;
}

/**
 * Stable SHA-256 over the canonical sorted-key JSON form of the dimensions
 * map. Two rows with the same `(propertyId, observedDate)` are considered
 * duplicates iff their dimensions hash matches — so a re-run of the same
 * cron is a no-op, but a new dimension breakdown writes fresh rows.
 */
const hashDimensions = (dims: Record<string, string>): string => {
	const sorted = Object.keys(dims)
		.sort()
		.reduce<Record<string, string>>((acc, k) => {
			acc[k] = dims[k] ?? '';
			return acc;
		}, {});
	return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
};

const SESSIONS_METRIC_KEYS = ['sessions', 'totalSessions'];
const USERS_METRIC_KEYS = ['totalUsers', 'activeUsers', 'newUsers'];

const sumByKey = (rows: readonly Ga4RowInput[], keys: readonly string[]): number => {
	let total = 0;
	for (const row of rows) {
		for (const k of keys) {
			const v = row.metrics[k];
			if (typeof v === 'number' && Number.isFinite(v)) {
				total += v;
				break;
			}
		}
	}
	return total;
};

/**
 * Persists a batch of GA4 daily-metric rows for a linked property and
 * publishes one summary event with totals, mirroring the GSC ingest.
 *
 * Idempotency: the natural PK is `(ga4_property_id, observed_date,
 * dimensions_hash)`. The repo does `onConflictDoNothing`, and we publish
 * the *inserted* count, not the input length — so a retry of the same
 * window with the same dimension breakdown reports zero ingestion.
 */
export class IngestGa4RowsUseCase {
	constructor(
		private readonly properties: TrafficAnalytics.Ga4PropertyRepository,
		private readonly metrics: TrafficAnalytics.Ga4DailyMetricRepository,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
		private readonly clock: Clock,
	) {}

	async execute(cmd: IngestGa4RowsCommand): Promise<IngestGa4RowsResult> {
		if (cmd.rows.length === 0) return { ingested: 0 };

		const property = await this.properties.findById(cmd.ga4PropertyId as TrafficAnalytics.Ga4PropertyId);
		if (!property) throw new NotFoundError(`Ga4Property ${cmd.ga4PropertyId} not found`);
		if (!property.isActive()) return { ingested: 0 };

		const aggregates = cmd.rows.map((row) =>
			TrafficAnalytics.Ga4DailyMetric.record({
				id: this.ids.generate() as TrafficAnalytics.Ga4DailyMetricId,
				ga4PropertyId: property.id,
				projectId: property.projectId,
				observedDate: row.observedDate,
				dimensionsHash: hashDimensions(row.dimensions),
				body: TrafficAnalytics.Ga4DailyDimensionsMetrics.create({
					dimensions: row.dimensions,
					metrics: row.metrics,
				}),
				rawPayloadId: cmd.rawPayloadId,
			}),
		);

		const { inserted } = await this.metrics.saveAll(aggregates);

		await this.events.publish([
			new TrafficAnalytics.Ga4BatchIngested({
				projectId: property.projectId,
				ga4PropertyId: property.id,
				rowsCount: inserted,
				totalSessions: sumByKey(cmd.rows, SESSIONS_METRIC_KEYS),
				totalUsers: sumByKey(cmd.rows, USERS_METRIC_KEYS),
				occurredAt: this.clock.now(),
			}),
		]);

		return { ingested: inserted };
	}
}
