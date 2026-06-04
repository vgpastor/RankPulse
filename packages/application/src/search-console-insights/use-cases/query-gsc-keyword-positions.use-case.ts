import type { ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface QueryGscKeywordPositionsCommand {
	projectId: string;
	windowDays?: number;
}

export interface GscKeywordPositionRow {
	/** GSC property (site URL) the position belongs to, e.g. `sc-domain:guardtour.app`. */
	siteUrl: string;
	query: string;
	/** Impression-weighted average position GSC reports for the query (1 decimal). */
	position: number;
}

export interface QueryGscKeywordPositionsResponse {
	rows: GscKeywordPositionRow[];
}

const DEFAULT_WINDOW_DAYS = 28;

/**
 * Average GSC position per (property, query) for a project. Powers the
 * rank-tracking view's GSC fallback (#200): a brand-new domain may earn real
 * impressions (so GSC reports an average position) while never appearing in the
 * live SERP scrape — the rankings table shows this value, tagged as GSC, when
 * the SERP position is `null`.
 *
 * Reuses the cockpit `aggregateByQuery` primitive (already per-property and
 * country-unaware) with `minImpressions=1` so even low-traffic queries surface
 * — the consumer matches them against tracked keywords, so there is no top-N
 * concern here.
 */
export class QueryGscKeywordPositionsUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly cockpit: SearchConsoleInsights.GscCockpitReadModel,
	) {}

	async execute(cmd: QueryGscKeywordPositionsCommand): Promise<QueryGscKeywordPositionsResponse> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const windowDays = cmd.windowDays ?? DEFAULT_WINDOW_DAYS;
		const aggregate = await this.cockpit.aggregateByQuery(projectId, windowDays, {
			minImpressions: 1,
			limit: 5000,
		});

		const rows: GscKeywordPositionRow[] = [];
		for (const r of aggregate) {
			if (r.avgPosition <= 0) continue;
			rows.push({ siteUrl: r.siteUrl, query: r.query, position: Number(r.avgPosition.toFixed(1)) });
		}
		return { rows };
	}
}
