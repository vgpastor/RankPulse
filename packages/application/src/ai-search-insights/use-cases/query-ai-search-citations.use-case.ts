import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';

export interface QueryAiSearchCitationsQuery {
	projectId: string;
	from?: Date;
	to?: Date;
	onlyOwnDomains?: boolean;
	aiProvider?: AiSearchInsights.AiProviderName;
}

export interface AiSearchCitationDto {
	url: string;
	domain: string;
	isOwnDomain: boolean;
	totalCitations: number;
	providers: readonly AiSearchInsights.AiProviderName[];
	firstSeenAt: string;
	lastSeenAt: string;
}

const DEFAULT_WINDOW_DAYS = 30;

/**
 * Lists every URL the connected LLM-search providers cited in the window.
 * Default surface is "all citations"; the UI defaults to `onlyOwnDomains:
 * true` to surface link-building wins, but the read model returns the full
 * list so a competitive view can show domains we DON'T own too.
 */
export class QueryAiSearchCitationsUseCase {
	constructor(private readonly readModel: AiSearchInsights.LlmAnswerReadModel) {}

	async execute(query: QueryAiSearchCitationsQuery): Promise<readonly AiSearchCitationDto[]> {
		const to = query.to ?? new Date();
		const from = query.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
		const rows = await this.readModel.citationsForProject(query.projectId as ProjectManagement.ProjectId, {
			from,
			to,
			onlyOwnDomains: query.onlyOwnDomains,
			aiProvider: query.aiProvider,
		});
		return rows.map((r) => ({
			url: r.url,
			domain: r.domain,
			isOwnDomain: r.isOwnDomain,
			totalCitations: r.totalCitations,
			providers: r.providers,
			firstSeenAt: r.firstSeenAt.toISOString(),
			lastSeenAt: r.lastSeenAt.toISOString(),
		}));
	}
}
