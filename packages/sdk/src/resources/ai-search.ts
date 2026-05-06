import type { AiSearchInsightsContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export class AiSearchResource {
	constructor(private readonly http: HttpClient) {}

	listPrompts(projectId: string): Promise<AiSearchInsightsContracts.ListBrandPromptsResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/brand-prompts`);
	}

	createPrompt(
		projectId: string,
		body: AiSearchInsightsContracts.RegisterBrandPromptRequest,
	): Promise<AiSearchInsightsContracts.RegisterBrandPromptResponse> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/brand-prompts`, body);
	}

	pausePrompt(
		projectId: string,
		promptId: string,
		body: AiSearchInsightsContracts.PauseBrandPromptRequest,
	): Promise<{ brandPromptId: string; pausedAt: string | null }> {
		return this.http.patch(
			`/projects/${encodeURIComponent(projectId)}/brand-prompts/${encodeURIComponent(promptId)}`,
			body,
		);
	}

	deletePrompt(projectId: string, promptId: string): Promise<void> {
		return this.http.delete(
			`/projects/${encodeURIComponent(projectId)}/brand-prompts/${encodeURIComponent(promptId)}`,
		);
	}

	listAnswersForPrompt(
		projectId: string,
		promptId: string,
		query?: AiSearchInsightsContracts.ListLlmAnswersQuery,
	): Promise<AiSearchInsightsContracts.ListLlmAnswersResponse> {
		return this.http.get(
			`/projects/${encodeURIComponent(projectId)}/brand-prompts/${encodeURIComponent(promptId)}/answers`,
			{ query: query ?? {} },
		);
	}

	listAnswersForProject(
		projectId: string,
		query?: AiSearchInsightsContracts.ListLlmAnswersQuery,
	): Promise<AiSearchInsightsContracts.ListLlmAnswersResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/ai-search/answers`, {
			query: query ?? {},
		});
	}

	presence(
		projectId: string,
		query?: AiSearchInsightsContracts.AiSearchPresenceQuery,
	): Promise<AiSearchInsightsContracts.AiSearchPresenceResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/ai-search/presence`, {
			query: query ?? {},
		});
	}

	sov(
		projectId: string,
		query?: AiSearchInsightsContracts.AiSearchSovQuery,
	): Promise<AiSearchInsightsContracts.AiSearchSovResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/ai-search/sov`, {
			query: query ?? {},
		});
	}

	citations(
		projectId: string,
		query?: AiSearchInsightsContracts.AiSearchCitationsQuery,
	): Promise<AiSearchInsightsContracts.AiSearchCitationsResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/ai-search/citations`, {
			query: query ?? {},
		});
	}

	promptSovDaily(
		projectId: string,
		promptId: string,
		query?: AiSearchInsightsContracts.AiSearchSovDailyQuery,
	): Promise<AiSearchInsightsContracts.AiSearchSovDailyResponse> {
		return this.http.get(
			`/projects/${encodeURIComponent(projectId)}/brand-prompts/${encodeURIComponent(promptId)}/sov-daily`,
			{ query: query ?? {} },
		);
	}

	competitiveMatrix(
		projectId: string,
		query?: AiSearchInsightsContracts.CompetitiveMatrixQuery,
	): Promise<AiSearchInsightsContracts.CompetitiveMatrixResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/ai-search/competitive-matrix`, {
			query: query ?? {},
		});
	}

	alerts(projectId: string): Promise<AiSearchInsightsContracts.AiSearchAlertsResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/ai-search/alerts`);
	}
}
