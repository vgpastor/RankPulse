import type { TrafficAnalyticsContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export class Ga4Resource {
	constructor(private readonly http: HttpClient) {}

	listForProject(projectId: string): Promise<TrafficAnalyticsContracts.Ga4PropertyDto[]> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/ga4/properties`);
	}

	link(
		projectId: string,
		body: TrafficAnalyticsContracts.LinkGa4PropertyRequest,
	): Promise<{ ga4PropertyId: string }> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/ga4/properties`, body);
	}

	unlink(ga4PropertyId: string): Promise<{ ok: true }> {
		return this.http.delete(`/ga4/properties/${encodeURIComponent(ga4PropertyId)}`);
	}

	metrics(
		ga4PropertyId: string,
		query: TrafficAnalyticsContracts.Ga4MetricsQuery,
	): Promise<TrafficAnalyticsContracts.Ga4DailyMetricDto[]> {
		return this.http.get(`/ga4/properties/${encodeURIComponent(ga4PropertyId)}/metrics`, {
			query: { from: query.from, to: query.to },
		});
	}
}
