import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { BrandWatchEntry } from '../value-objects/brand-watch-entry.js';

/**
 * Reads `Project.domain` (own brand) plus `project_competitors` (competitor
 * brands) and produces the watchlist the LLM-judge consumes. Adapter lives in
 * `infrastructure/persistence/drizzle/repositories/ai-search-insights/` so
 * the domain stays oblivious to the SQL join, and can switch to a different
 * source (config, GraphQL) without touching ai-search-insights.
 */
export interface BrandWatchlistResolver {
	resolveForProject(projectId: ProjectId): Promise<readonly BrandWatchEntry[]>;
}
