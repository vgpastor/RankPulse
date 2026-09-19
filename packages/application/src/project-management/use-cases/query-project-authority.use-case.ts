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

export interface ProjectAuthorityView {
	projectId: string;
	domain: string;
	latest: ProjectAuthorityPointView | null;
	history: readonly ProjectAuthorityPointView[];
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
		const history = await this.observations.listForProject(projectId, input.limit ?? 24);
		const points = history.map(toPoint);
		return {
			projectId: input.projectId,
			domain: project.primaryDomain.value,
			latest: points[0] ?? null,
			history: points,
		};
	}
}
