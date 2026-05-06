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
}
