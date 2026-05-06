import type { ExperienceAnalyticsContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export class ClarityResource {
	constructor(private readonly http: HttpClient) {}

	listForProject(projectId: string): Promise<ExperienceAnalyticsContracts.ClarityProjectDto[]> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/clarity/projects`);
	}

	link(
		projectId: string,
		body: ExperienceAnalyticsContracts.LinkClarityProjectRequest,
	): Promise<{ clarityProjectId: string }> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/clarity/projects`, body);
	}

	unlink(clarityProjectId: string): Promise<{ ok: true }> {
		return this.http.delete(`/clarity/projects/${encodeURIComponent(clarityProjectId)}`);
	}

	history(
		clarityProjectId: string,
		query: ExperienceAnalyticsContracts.ExperienceHistoryQuery,
	): Promise<ExperienceAnalyticsContracts.ExperienceHistoryRowDto[]> {
		return this.http.get(`/clarity/projects/${encodeURIComponent(clarityProjectId)}/history`, {
			query: { from: query.from, to: query.to },
		});
	}
}
