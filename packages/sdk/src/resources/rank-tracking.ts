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

	serpMap(
		projectId: string,
		query?: RankTrackingContracts.SerpMapQuery,
	): Promise<RankTrackingContracts.SerpMapResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/serp-map`, {
			query: {
				phrase: query?.phrase ?? null,
				country: query?.country ?? null,
				language: query?.language ?? null,
				windowDays: query?.windowDays ? String(query.windowDays) : null,
			},
		});
	}

	serpCompetitorSuggestions(
		projectId: string,
		query?: RankTrackingContracts.SerpCompetitorSuggestionsQuery,
	): Promise<RankTrackingContracts.SerpCompetitorSuggestionsResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/serp-map/suggestions`, {
			query: {
				minDistinctKeywords: query?.minDistinctKeywords ? String(query.minDistinctKeywords) : null,
				windowDays: query?.windowDays ? String(query.windowDays) : null,
			},
		});
	}

	getRankedKeywords(
		projectId: string,
		query: RankTrackingContracts.RankedKeywordsQuery,
	): Promise<RankTrackingContracts.RankedKeywordsResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/ranked-keywords`, {
			query: {
				targetDomain: query.targetDomain,
				limit: query.limit ? String(query.limit) : null,
				minVolume: query.minVolume != null ? String(query.minVolume) : null,
			},
		});
	}
}
