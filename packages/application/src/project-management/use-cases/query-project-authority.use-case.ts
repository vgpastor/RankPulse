import type { ProjectManagement } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface ProjectAuthorityPointView {
	observedAt: string;
	totalBacklinks: number;
	referringDomains: number;
	referringMainDomains: number;
	referringPages: number;
	brokenBacklinks: number;
	spamScore: number | null;
	rank: number | null;
}

export interface DomainAuthorityView {
	domain: string;
	latest: ProjectAuthorityPointView | null;
	history: readonly ProjectAuthorityPointView[];
}

export interface ProjectAuthorityView {
	projectId: string;
	/** One entry per project domain, primary first, in the project's order. */
	domains: readonly DomainAuthorityView[];
}

const toPoint = (o: ProjectManagement.DomainAuthorityObservation): ProjectAuthorityPointView => ({
	observedAt: o.observedAt.toISOString(),
	...o.metrics,
});

export class QueryProjectAuthorityUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly observations: ProjectManagement.DomainAuthorityObservationRepository,
	) {}

	async execute(input: { projectId: string; limit?: number }): Promise<ProjectAuthorityView> {
		const projectId = input.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) throw new NotFoundError(`Project ${input.projectId} not found`);
		const all = await this.observations.listForProject(
			projectId,
			(input.limit ?? 24) * project.domains.length,
		);
		const domains = project.domains.map(({ domain }) => {
			const points = all
				.filter((o) => o.domain === domain.value)
				.slice(0, input.limit ?? 24)
				.map(toPoint);
			return { domain: domain.value, latest: points[0] ?? null, history: points };
		});
		return { projectId: input.projectId, domains };
	}
}
