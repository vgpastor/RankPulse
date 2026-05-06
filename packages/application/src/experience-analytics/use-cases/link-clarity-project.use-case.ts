import {
	ExperienceAnalytics,
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface LinkClarityProjectCommand {
	organizationId: string;
	projectId: string;
	clarityHandle: string;
	credentialId?: string | null;
}

export interface LinkClarityProjectResult {
	clarityProjectId: string;
}

export class LinkClarityProjectUseCase {
	constructor(
		private readonly projects: ExperienceAnalytics.ClarityProjectRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: LinkClarityProjectCommand): Promise<LinkClarityProjectResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		// Canonicalise via the VO so the lookup matches the row we'd write.
		const handle = ExperienceAnalytics.ClarityProjectHandle.create(cmd.clarityHandle);
		const existing = await this.projects.findByProjectAndHandle(projectId, handle.value);
		if (existing?.isActive()) {
			throw new ConflictError(`Clarity project ${handle.value} is already linked to this project`);
		}

		const id = this.ids.generate() as ExperienceAnalytics.ClarityProjectId;
		const cp = ExperienceAnalytics.ClarityProject.link({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			clarityHandle: handle.value,
			credentialId: cmd.credentialId ?? null,
			now: this.clock.now(),
		});
		await this.projects.save(cp);
		await this.events.publish(cp.pullEvents());
		return { clarityProjectId: id };
	}
}
