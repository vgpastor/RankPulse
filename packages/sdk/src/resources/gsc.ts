import type { SearchConsoleInsightsContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export interface GscPerformanceFilters {
	from?: string;
	to?: string;
	query?: string;
	page?: string;
	country?: string;
	device?: string;
}

export class GscResource {
	constructor(private readonly http: HttpClient) {}

	linkProperty(
		body: SearchConsoleInsightsContracts.LinkGscPropertyRequest,
	): Promise<{ gscPropertyId: string }> {
		return this.http.post('/gsc/properties', body);
	}

	listForProject(projectId: string): Promise<SearchConsoleInsightsContracts.GscPropertyDto[]> {
		return this.http.get(`/gsc/projects/${encodeURIComponent(projectId)}/properties`);
	}

	performance(
		propertyId: string,
		filters: GscPerformanceFilters = {},
	): Promise<SearchConsoleInsightsContracts.GscPerformancePointDto[]> {
		return this.http.get(`/gsc/properties/${encodeURIComponent(propertyId)}/performance`, {
			query: { ...filters },
		});
	}
}
