import type { ProjectManagementContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export interface CompetitorListItem {
	id: string;
	domain: string;
	label: string;
	createdAt: string;
}

export interface KeywordListEntry {
	id: string;
	name: string;
	keywords: { id: string; phrase: string; tags: readonly string[] }[];
}

export class ProjectsResource {
	constructor(private readonly http: HttpClient) {}

	list(organizationId: string): Promise<ProjectManagementContracts.ProjectDto[]> {
		return this.http.get('/projects', { query: { organizationId } });
	}

	get(id: string): Promise<ProjectManagementContracts.ProjectDto> {
		return this.http.get(`/projects/${encodeURIComponent(id)}`);
	}

	/**
	 * #172 — data-freshness summary across rankings, ai-search, gsc, ga4,
	 * bing, pagespeed, clarity. Single round-trip for daily health checks.
	 */
	getFreshness(id: string): Promise<ProjectManagementContracts.ProjectFreshnessResponse> {
		return this.http.get(`/projects/${encodeURIComponent(id)}/freshness`);
	}

	create(
		body: ProjectManagementContracts.CreateProjectRequest,
	): Promise<ProjectManagementContracts.ProjectDto> {
		return this.http.post('/projects', body);
	}

	addDomain(
		projectId: string,
		body: { domain: string; kind?: 'main' | 'subdomain' | 'alias' },
	): Promise<ProjectManagementContracts.ProjectDto> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/domains`, body);
	}

	addLocation(
		projectId: string,
		body: { country: string; language: string },
	): Promise<ProjectManagementContracts.ProjectDto> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/locations`, body);
	}

	/**
	 * Idempotent ensure-and-refeed. Returns `created: true` for a fresh
	 * competitor, `created: false` if it already existed (in which case
	 * the call only re-published CompetitorAdded so auto-schedule
	 * handlers backfill missing feeders).
	 */
	addCompetitor(
		projectId: string,
		body: ProjectManagementContracts.AddCompetitorRequest,
	): Promise<{ competitorId: string; created: boolean }> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/competitors`, body);
	}

	listCompetitors(projectId: string): Promise<CompetitorListItem[]> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/competitors`);
	}

	listCompetitorSuggestions(
		projectId: string,
		options?: { eligibleOnly?: boolean },
	): Promise<ProjectManagementContracts.CompetitorSuggestionDto[]> {
		const query: Record<string, string> = {};
		if (options?.eligibleOnly === false) query.eligibleOnly = 'false';
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/competitor-suggestions`, { query });
	}

	promoteCompetitorSuggestion(
		suggestionId: string,
		body: ProjectManagementContracts.PromoteCompetitorSuggestionRequest = {},
	): Promise<{ competitorId: string }> {
		return this.http.post(
			`/projects/competitor-suggestions/${encodeURIComponent(suggestionId)}/promote`,
			body,
		);
	}

	dismissCompetitorSuggestion(suggestionId: string): Promise<{ ok: true }> {
		return this.http.post(`/projects/competitor-suggestions/${encodeURIComponent(suggestionId)}/dismiss`, {});
	}

	importKeywords(
		projectId: string,
		body: ProjectManagementContracts.ImportKeywordsRequest,
	): Promise<{ keywordListId: string; added: number }> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/keywords`, body);
	}

	listKeywordLists(projectId: string): Promise<KeywordListEntry[]> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/keywords`);
	}

	createPortfolio(
		organizationId: string,
		body: ProjectManagementContracts.CreatePortfolioRequest,
	): Promise<{ portfolioId: string }> {
		return this.http.post(`/organizations/${encodeURIComponent(organizationId)}/portfolios`, body);
	}

	listPortfolios(organizationId: string): Promise<ProjectManagementContracts.PortfolioDto[]> {
		return this.http.get(`/organizations/${encodeURIComponent(organizationId)}/portfolios`);
	}

	getPortfolio(portfolioId: string): Promise<ProjectManagementContracts.PortfolioDto> {
		return this.http.get(`/portfolios/${encodeURIComponent(portfolioId)}`);
	}

	renamePortfolio(
		portfolioId: string,
		body: ProjectManagementContracts.RenamePortfolioRequest,
	): Promise<ProjectManagementContracts.PortfolioDto> {
		return this.http.patch(`/portfolios/${encodeURIComponent(portfolioId)}`, body);
	}

	deletePortfolio(portfolioId: string): Promise<void> {
		return this.http.delete(`/portfolios/${encodeURIComponent(portfolioId)}`);
	}
}
