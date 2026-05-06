import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';

/**
 * Test stub: returns a fixed watchlist regardless of project.
 */
export class StaticBrandWatchlistResolver implements AiSearchInsights.BrandWatchlistResolver {
	constructor(private readonly entries: readonly AiSearchInsights.BrandWatchEntry[]) {}

	async resolveForProject(
		_projectId: ProjectManagement.ProjectId,
	): Promise<readonly AiSearchInsights.BrandWatchEntry[]> {
		return this.entries;
	}
}
