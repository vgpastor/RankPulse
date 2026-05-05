import type { RankTrackingContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export interface ProjectRankingItem {
	trackedKeywordId: string;
	phrase: string;
	domain: string;
	country: string;
	language: string;
	device: 'desktop' | 'mobile';
	position: number | null;
	url: string | null;
	observedAt: string;
}

export class RankTrackingResource {
	constructor(private readonly http: HttpClient) {}

	startTracking(
		body: RankTrackingContracts.StartTrackingKeywordRequest,
	): Promise<RankTrackingContracts.StartTrackingKeywordResponse> {
		return this.http.post('/rank-tracking/keywords', body);
	}

	listProjectRankings(projectId: string): Promise<ProjectRankingItem[]> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/rankings`);
	}

	history(
		trackedKeywordId: string,
		query?: RankTrackingContracts.RankingHistoryQuery,
	): Promise<RankTrackingContracts.RankingHistoryEntryDto[]> {
		return this.http.get(`/rank-tracking/keywords/${encodeURIComponent(trackedKeywordId)}/history`, {
			query: { from: query?.from ?? null, to: query?.to ?? null },
		});
	}
}
