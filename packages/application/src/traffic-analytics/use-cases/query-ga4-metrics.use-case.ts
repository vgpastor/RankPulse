import type { TrafficAnalytics } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryGa4MetricsCommand {
	ga4PropertyId: string;
	from: string; // YYYY-MM-DD inclusive
	to: string; // YYYY-MM-DD inclusive
}

export interface Ga4MetricView {
	observedDate: string;
	dimensions: Record<string, string>;
	metrics: Record<string, number>;
}

export class QueryGa4MetricsUseCase {
	constructor(
		private readonly properties: TrafficAnalytics.Ga4PropertyRepository,
		private readonly metrics: TrafficAnalytics.Ga4DailyMetricRepository,
	) {}

	async execute(cmd: QueryGa4MetricsCommand): Promise<readonly Ga4MetricView[]> {
		const property = await this.properties.findById(cmd.ga4PropertyId as TrafficAnalytics.Ga4PropertyId);
		if (!property) throw new NotFoundError(`Ga4Property ${cmd.ga4PropertyId} not found`);
		const rows = await this.metrics.listForProperty(property.id, { from: cmd.from, to: cmd.to });
		return rows.map((r) => ({
			observedDate: r.observedDate,
			dimensions: { ...r.body.dimensions },
			metrics: { ...r.body.metrics },
		}));
	}
}
