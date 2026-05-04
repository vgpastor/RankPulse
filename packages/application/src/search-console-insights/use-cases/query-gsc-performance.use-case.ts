import type { SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryGscPerformanceCommand {
	gscPropertyId: string;
	from: Date;
	to: Date;
	query?: string | null;
	page?: string | null;
	country?: string | null;
	device?: string | null;
}

export interface GscPerformancePoint {
	observedAt: string;
	query: string | null;
	page: string | null;
	country: string | null;
	device: string | null;
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
}

export class QueryGscPerformanceUseCase {
	constructor(
		private readonly properties: SearchConsoleInsights.GscPropertyRepository,
		private readonly observations: SearchConsoleInsights.GscPerformanceObservationRepository,
	) {}

	async execute(cmd: QueryGscPerformanceCommand): Promise<GscPerformancePoint[]> {
		const id = cmd.gscPropertyId as SearchConsoleInsights.GscPropertyId;
		const property = await this.properties.findById(id);
		if (!property) {
			throw new NotFoundError(`GscProperty ${cmd.gscPropertyId} not found`);
		}
		const rows = await this.observations.listForProperty(id, {
			from: cmd.from,
			to: cmd.to,
			query: cmd.query ?? null,
			page: cmd.page ?? null,
			country: cmd.country ?? null,
			device: cmd.device ?? null,
		});
		return rows.map((o) => ({
			observedAt: o.observedAt.toISOString(),
			query: o.query,
			page: o.page,
			country: o.country,
			device: o.device,
			clicks: o.metrics.clicks,
			impressions: o.metrics.impressions,
			ctr: o.metrics.ctr,
			position: o.metrics.position,
		}));
	}
}
