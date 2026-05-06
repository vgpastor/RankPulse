import type { ExperienceAnalytics } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryExperienceHistoryCommand {
	clarityProjectId: string;
	from: string;
	to: string;
}

export interface ExperienceHistoryView {
	observedDate: string;
	sessionsCount: number;
	botSessionsCount: number;
	distinctUserCount: number;
	pagesPerSession: number;
	rageClicks: number;
	deadClicks: number;
	avgEngagementSeconds: number;
	avgScrollDepth: number;
}

export class QueryExperienceHistoryUseCase {
	constructor(
		private readonly projects: ExperienceAnalytics.ClarityProjectRepository,
		private readonly snapshots: ExperienceAnalytics.ExperienceSnapshotRepository,
	) {}

	async execute(cmd: QueryExperienceHistoryCommand): Promise<readonly ExperienceHistoryView[]> {
		const cp = await this.projects.findById(cmd.clarityProjectId as ExperienceAnalytics.ClarityProjectId);
		if (!cp) throw new NotFoundError(`ClarityProject ${cmd.clarityProjectId} not found`);
		const rows = await this.snapshots.listForClarityProject(cp.id, { from: cmd.from, to: cmd.to });
		return rows.map((r) => ({
			observedDate: r.observedDate,
			sessionsCount: r.metrics.sessionsCount,
			botSessionsCount: r.metrics.botSessionsCount,
			distinctUserCount: r.metrics.distinctUserCount,
			pagesPerSession: r.metrics.pagesPerSession,
			rageClicks: r.metrics.rageClicks,
			deadClicks: r.metrics.deadClicks,
			avgEngagementSeconds: r.metrics.avgEngagementSeconds,
			avgScrollDepth: r.metrics.avgScrollDepth,
		}));
	}
}
