import type { ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryCtrAnomaliesCommand {
	projectId: string;
	windowDays?: number;
	minImpressions?: number;
}

export interface CtrAnomalyDto {
	query: string;
	page: string | null;
	impressions: number;
	clicks: number;
	avgPosition: number;
}

export interface QueryCtrAnomaliesResponse {
	anomalies: CtrAnomalyDto[];
}

const DEFAULT_WINDOW_DAYS = 28;
const DEFAULT_MIN_IMPRESSIONS = 50;
const POSITION_CAP = 30;

/**
 * Detects keywords that show in the SERP (position ≤ 30) with material
 * impression volume yet receive **zero clicks** within the rolling window.
 * The signal almost always means: snippet is broken (no title/meta), the
 * page is canonical-redirected away, or AI Overviews ate the click. A
 * human action is warranted on every row this returns.
 */
export class QueryCtrAnomaliesUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly cockpit: SearchConsoleInsights.GscCockpitReadModel,
	) {}

	async execute(cmd: QueryCtrAnomaliesCommand): Promise<QueryCtrAnomaliesResponse> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const windowDays = cmd.windowDays ?? DEFAULT_WINDOW_DAYS;
		const minImpressions = Math.max(1, cmd.minImpressions ?? DEFAULT_MIN_IMPRESSIONS);

		const rows = await this.cockpit.aggregateByQuery(projectId, windowDays, {
			minImpressions,
			limit: 1000,
		});
		const anomalies: CtrAnomalyDto[] = [];
		for (const r of rows) {
			if (r.totalClicks > 0) continue;
			if (r.avgPosition <= 0 || r.avgPosition > POSITION_CAP) continue;
			anomalies.push({
				query: r.query,
				page: r.bestPage,
				impressions: r.totalImpressions,
				clicks: r.totalClicks,
				avgPosition: Number(r.avgPosition.toFixed(2)),
			});
		}
		// Sort by impression volume so the highest-cost anomalies surface first.
		anomalies.sort((a, b) => b.impressions - a.impressions);
		return { anomalies };
	}
}
