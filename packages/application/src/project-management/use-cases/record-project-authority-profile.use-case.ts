import { ProjectManagement } from '@rankpulse/domain';
import { type Clock, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface RecordProjectAuthorityProfileCommand {
	projectId: string;
	rawPayloadId: string | null;
	summary: ProjectManagement.BacklinksProfileMetrics;
}

/**
 * Persists one DataForSEO `backlinks/summary/live` row taken against the
 * project's own primary domain. The domain is read from the project rather
 * than trusted from the payload, so a schedule pointed at the wrong target
 * cannot masquerade as the project's authority.
 */
export class RecordProjectAuthorityProfileUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly observations: ProjectManagement.DomainAuthorityObservationRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: RecordProjectAuthorityProfileCommand): Promise<{ observationId: string }> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const id = this.ids.generate() as ProjectManagement.DomainAuthorityObservationId;
		const observation = ProjectManagement.DomainAuthorityObservation.record({
			id,
			projectId,
			domain: project.primaryDomain.value,
			metrics: cmd.summary,
			rawPayloadId: cmd.rawPayloadId,
			now: this.clock.now(),
		});
		await this.observations.save(observation);
		return { observationId: id };
	}
}
