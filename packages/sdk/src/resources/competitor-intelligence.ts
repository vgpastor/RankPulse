import type { CompetitorIntelligenceContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export class CompetitorIntelligenceResource {
	constructor(private readonly http: HttpClient) {}

	getKeywordGaps(
		projectId: string,
		query: CompetitorIntelligenceContracts.KeywordGapsQuery,
	): Promise<CompetitorIntelligenceContracts.KeywordGapsResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/keyword-gaps`, {
			query: {
				ourDomain: query.ourDomain,
				competitorDomain: query.competitorDomain,
				limit: query.limit ? String(query.limit) : null,
				minVolume: query.minVolume != null ? String(query.minVolume) : null,
			},
		});
	}

	getCompetitorPageAudits(
		projectId: string,
		query: CompetitorIntelligenceContracts.CompetitorPageAuditsQuery,
	): Promise<CompetitorIntelligenceContracts.CompetitorPageAuditsResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/competitor-page-audits`, {
			query: {
				competitorDomain: query.competitorDomain,
				url: query.url ?? null,
				limit: query.limit ? String(query.limit) : null,
			},
		});
	}
}
