import type { BingWebmasterInsightsContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export class BingResource {
	constructor(private readonly http: HttpClient) {}

	listForProject(projectId: string): Promise<BingWebmasterInsightsContracts.BingPropertyDto[]> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/bing/properties`);
	}

	link(
		projectId: string,
		body: BingWebmasterInsightsContracts.LinkBingPropertyRequest,
	): Promise<{ bingPropertyId: string }> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/bing/properties`, body);
	}

	unlink(bingPropertyId: string): Promise<{ ok: true }> {
		return this.http.delete(`/bing/properties/${encodeURIComponent(bingPropertyId)}`);
	}

	traffic(
		bingPropertyId: string,
		query: BingWebmasterInsightsContracts.BingTrafficQuery,
	): Promise<BingWebmasterInsightsContracts.BingTrafficObservationDto[]> {
		return this.http.get(`/bing/properties/${encodeURIComponent(bingPropertyId)}/traffic`, {
			query: { from: query.from, to: query.to },
		});
	}
}
