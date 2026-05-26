import type { ProjectManagement } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryProjectFreshnessCommand {
	readonly projectId: string;
}

/**
 * #172 — single round-trip summary of when each upstream data subsystem
 * (rankings, ai-search, gsc, ga4, bing, pagespeed, clarity) last
 * ingested for a project. Lets the daily health check answer "is
 * everything fresh? what's stale?" without iterating subsystem-specific
 * endpoints.
 *
 * Defers the actual heavy SQL to the read-model adapter; this use case
 * just guards "project exists" so a typo returns 404 instead of an
 * empty-but-200 freshness reply (which would mislead the operator into
 * thinking nothing's ingesting).
 */
export class QueryProjectFreshnessUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly freshness: ProjectManagement.ProjectFreshnessReadModel,
	) {}

	async execute(cmd: QueryProjectFreshnessCommand): Promise<ProjectManagement.ProjectFreshnessSummary> {
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		return this.freshness.summarize(project.id);
	}
}
