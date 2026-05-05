import type { EntityAwarenessContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export class WikipediaResource {
	constructor(private readonly http: HttpClient) {}

	listForProject(projectId: string): Promise<EntityAwarenessContracts.WikipediaArticleDto[]> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/wikipedia/articles`);
	}

	link(
		projectId: string,
		body: EntityAwarenessContracts.LinkWikipediaArticleRequest,
	): Promise<{ articleId: string }> {
		return this.http.post(`/projects/${encodeURIComponent(projectId)}/wikipedia/articles`, body);
	}

	unlink(articleId: string): Promise<{ ok: true }> {
		return this.http.post(`/wikipedia/articles/${encodeURIComponent(articleId)}/unlink`, {});
	}

	pageviews(
		articleId: string,
		query?: EntityAwarenessContracts.WikipediaPageviewQuery,
	): Promise<EntityAwarenessContracts.WikipediaPageviewDto[]> {
		return this.http.get(`/wikipedia/articles/${encodeURIComponent(articleId)}/pageviews`, {
			query: { from: query?.from ?? null, to: query?.to ?? null },
		});
	}
}
