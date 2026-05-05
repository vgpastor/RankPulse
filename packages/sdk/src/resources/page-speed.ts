import type { WebPerformanceContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export class PageSpeedResource {
	constructor(private readonly http: HttpClient) {}

	listForProject(projectId: string): Promise<WebPerformanceContracts.TrackedPageDto[]> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/page-speed/pages`);
	}

	track(
		projectId: string,
		body: WebPerformanceContracts.TrackPageRequest,
	): Promise<{ trackedPageId: string }> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/page-speed/pages`, body);
	}

	untrack(trackedPageId: string): Promise<{ ok: true }> {
		return this.http.delete(`/page-speed/pages/${encodeURIComponent(trackedPageId)}`);
	}

	history(
		trackedPageId: string,
		query?: WebPerformanceContracts.PageSpeedHistoryQuery,
	): Promise<WebPerformanceContracts.PageSpeedSnapshotDto[]> {
		return this.http.get(`/page-speed/pages/${encodeURIComponent(trackedPageId)}/history`, {
			query: { from: query?.from ?? null, to: query?.to ?? null },
		});
	}
}
