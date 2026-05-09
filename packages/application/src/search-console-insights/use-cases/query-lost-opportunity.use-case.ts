import type { ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';
import { ctrForPosition, DEFAULT_TARGET_POSITION } from '../lib/ctr-curve.js';

export interface QueryLostOpportunityCommand {
	projectId: string;
	windowDays?: number;
	minImpressions?: number;
	/** Position used as the "what would top-X earn" baseline. Default = 3. */
	targetPosition?: number;
	limit?: number;
}

export interface LostOpportunityDto {
	query: string;
	page: string | null;
	impressions: number;
	clicks: number;
	currentPosition: number;
	currentCtr: number;
	targetCtr: number;
	lostClicks: number;
}

export interface QueryLostOpportunityResponse {
	rows: LostOpportunityDto[];
	totalLostClicks: number;
}

const DEFAULT_WINDOW_DAYS = 28;
const DEFAULT_MIN_IMPRESSIONS = 100;
const DEFAULT_LIMIT = 50;

/**
 * Quantifies the click volume left on the table per keyword: for each
 * (query) tuple we compute `lostClicks = impressions × (CTR_at_target -
 * CTR_at_current)` using the AWR-2024 position-CTR curve. The issue's
 * formula is `vol × Δ-CTR × CPC`; the CPC factor is deferred until the
 * DataForSEO keyword-volume table lands (sub-issue), so the MVP returns
 * lost CLICKS — the user can multiply by their average CPC manually if
 * they want a € figure.
 *
 * Skips rows already at or above the target position (Δ-CTR ≤ 0) so the
 * panel only shows actionable opportunities.
 */
export class QueryLostOpportunityUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly cockpit: SearchConsoleInsights.GscCockpitReadModel,
	) {}

	async execute(cmd: QueryLostOpportunityCommand): Promise<QueryLostOpportunityResponse> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const windowDays = cmd.windowDays ?? DEFAULT_WINDOW_DAYS;
		const minImpressions = Math.max(1, cmd.minImpressions ?? DEFAULT_MIN_IMPRESSIONS);
		const targetPosition = clampInt(cmd.targetPosition ?? DEFAULT_TARGET_POSITION, 1, 30);
		const limit = clampInt(cmd.limit ?? DEFAULT_LIMIT, 1, 200);
		const targetCtrPct = ctrForPosition(targetPosition);

		const rows = await this.cockpit.aggregateByQuery(projectId, windowDays, {
			minImpressions,
			limit: 2000,
		});

		const out: LostOpportunityDto[] = [];
		let totalLost = 0;
		for (const r of rows) {
			if (r.avgPosition <= targetPosition) continue;
			const currentCtrPct = ctrForPosition(r.avgPosition);
			const deltaCtrPct = targetCtrPct - currentCtrPct;
			if (deltaCtrPct <= 0) continue;
			const lostClicks = r.totalImpressions * (deltaCtrPct / 100);
			if (lostClicks < 1) continue;
			totalLost += lostClicks;
			out.push({
				query: r.query,
				page: r.bestPage,
				impressions: r.totalImpressions,
				clicks: r.totalClicks,
				currentPosition: Number(r.avgPosition.toFixed(2)),
				currentCtr: Number((currentCtrPct / 100).toFixed(4)),
				targetCtr: Number((targetCtrPct / 100).toFixed(4)),
				lostClicks: Math.round(lostClicks),
			});
		}
		out.sort((a, b) => b.lostClicks - a.lostClicks);
		return { rows: out.slice(0, limit), totalLostClicks: Math.round(totalLost) };
	}
}

const clampInt = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(v)));
