import type { ProjectManagement } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface RemoveCompetitorCommand {
	projectId: string;
	competitorId: string;
}

export interface RemoveCompetitorResult {
	removed: boolean;
}

/**
 * Hard-delete a competitor from a project. Use case stays focused on the
 * Competitor aggregate — historical observations in
 * `competitor_keyword_gaps`, `competitor_page_audits` and
 * `ranked_keywords_observations` are preserved (they reference the
 * competitor by `domain` string, not by FK to the competitor entry).
 *
 * Operators that want to also purge orphaned `dataforseo-labs-*`
 * job-definitions referencing this competitor should call the existing
 * `DELETE /providers/.../job-definitions/{id}` per def. We intentionally
 * do NOT cascade here because:
 *   - Job-definitions span multiple bounded contexts; cleaning them via
 *     this aggregate would couple project-management to
 *     provider-connectivity in an undesirable way.
 *   - Cron-driven defs become no-op cheap (DataForSEO returns 0 rows
 *     when target is non-existent) but the operator may still want to
 *     preserve them for audit.
 *
 * The endpoint is idempotent: a NotFoundError is raised when the
 * (project, competitor) pair does not match — distinguishes "wrong project
 * for this id" from a true 404.
 */
export class RemoveCompetitorUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly competitors: ProjectManagement.CompetitorRepository,
	) {}

	async execute(cmd: RemoveCompetitorCommand): Promise<RemoveCompetitorResult> {
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const competitor = await this.competitors.findById(cmd.competitorId as ProjectManagement.CompetitorId);
		if (!competitor || competitor.projectId !== project.id) {
			throw new NotFoundError(`Competitor ${cmd.competitorId} not found in project ${cmd.projectId}`);
		}
		await this.competitors.remove(competitor.id);
		return { removed: true };
	}
}
