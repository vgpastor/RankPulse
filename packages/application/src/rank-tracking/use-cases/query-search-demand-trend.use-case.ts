import type { ProjectManagement, RankTracking } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QuerySearchDemandTrendCommand {
	projectId: string;
	months?: number;
	targetDomain?: string;
}

export interface SearchDemandPointDto {
	month: string;
	totalVolume: number;
	distinctKeywords: number;
}

export interface SearchDemandTrendResponseDto {
	points: SearchDemandPointDto[];
	latestVolume: number;
	previousVolume: number;
	deltaPct: number | null;
}

const DEFAULT_MONTHS = 13;

/**
 * Issue #117 Sprint 4 — Search Demand Trend.
 *
 * Returns one bucket per UTC month for the trailing N months (default 13
 * to expose YoY) summing `search_volume` across the project's tracked
 * keyword universe. The `previousVolume` is the SECOND-to-last bucket, not
 * the bucket at month-1 — for projects refreshed only every few months
 * picking the bucket immediately before the latest is more honest than
 * fixing on `now() - 1 month` and getting `null` half the time.
 */
export class QuerySearchDemandTrendUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly observations: RankTracking.RankedKeywordObservationRepository,
	) {}

	async execute(cmd: QuerySearchDemandTrendCommand): Promise<SearchDemandTrendResponseDto> {
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const months = cmd.months ?? DEFAULT_MONTHS;
		const buckets = await this.observations.aggregateMonthlyVolumeForProject(project.id, {
			months,
			targetDomain: cmd.targetDomain,
		});

		const points = buckets.map((b) => ({
			month: b.month.toISOString(),
			totalVolume: b.totalVolume,
			distinctKeywords: b.distinctKeywords,
		}));

		const latestVolume = points.length === 0 ? 0 : (points[points.length - 1]?.totalVolume ?? 0);
		const previousVolume = points.length < 2 ? 0 : (points[points.length - 2]?.totalVolume ?? 0);
		const deltaPct =
			previousVolume === 0
				? null
				: Math.round(((latestVolume - previousVolume) / previousVolume) * 1000) / 10;

		return { points, latestVolume, previousVolume, deltaPct };
	}
}
