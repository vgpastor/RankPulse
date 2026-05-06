import type { ExperienceAnalytics } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface UnlinkClarityProjectCommand {
	clarityProjectId: string;
}

export class UnlinkClarityProjectUseCase {
	constructor(
		private readonly projects: ExperienceAnalytics.ClarityProjectRepository,
		private readonly clock: Clock,
	) {}

	async execute(cmd: UnlinkClarityProjectCommand): Promise<void> {
		const cp = await this.projects.findById(cmd.clarityProjectId as ExperienceAnalytics.ClarityProjectId);
		if (!cp) throw new NotFoundError(`ClarityProject ${cmd.clarityProjectId} not found`);
		if (!cp.isActive()) return; // idempotent
		cp.unlink(this.clock.now());
		await this.projects.save(cp);
	}
}
