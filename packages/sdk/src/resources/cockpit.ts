import type { ProjectManagementContracts, SearchConsoleInsightsContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

const buildQuery = (input: Record<string, number | string | undefined>): Record<string, string | null> => {
	const out: Record<string, string | null> = {};
	for (const [key, value] of Object.entries(input)) {
		out[key] = value === undefined ? null : String(value);
	}
	return out;
};

/**
 * Decision Cockpit — read-only widgets composed from GSC + rank-tracking
 * data. Each method returns a typed response matching the controller's
 * Zod schema.
 */
export class CockpitResource {
	constructor(private readonly http: HttpClient) {}

	ctrAnomalies(
		projectId: string,
		query?: SearchConsoleInsightsContracts.CtrAnomaliesQuery,
	): Promise<SearchConsoleInsightsContracts.CtrAnomaliesResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/cockpit/ctr-anomalies`, {
			query: buildQuery({
				windowDays: query?.windowDays,
				minImpressions: query?.minImpressions,
			}),
		});
	}

	lostOpportunity(
		projectId: string,
		query?: SearchConsoleInsightsContracts.LostOpportunityQuery,
	): Promise<SearchConsoleInsightsContracts.LostOpportunityResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/cockpit/lost-opportunity`, {
			query: buildQuery({
				windowDays: query?.windowDays,
				minImpressions: query?.minImpressions,
				targetPosition: query?.targetPosition,
				limit: query?.limit,
			}),
		});
	}

	quickWinRoi(
		projectId: string,
		query?: SearchConsoleInsightsContracts.QuickWinRoiQuery,
	): Promise<SearchConsoleInsightsContracts.QuickWinRoiResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/cockpit/quick-win-roi`, {
			query: buildQuery({
				windowDays: query?.windowDays,
				minImpressions: query?.minImpressions,
				limit: query?.limit,
			}),
		});
	}

	brandDecay(
		projectId: string,
		query?: SearchConsoleInsightsContracts.BrandDecayQuery,
	): Promise<SearchConsoleInsightsContracts.BrandDecayResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/cockpit/brand-decay`, {
			query: buildQuery({
				windowDays: query?.windowDays,
				dropAlertPct: query?.dropAlertPct,
			}),
		});
	}

	competitorActivity(
		projectId: string,
		query?: ProjectManagementContracts.CompetitorActivityQuery,
	): Promise<ProjectManagementContracts.CompetitorActivityResponse> {
		return this.http.get(`/projects/${encodeURIComponent(projectId)}/cockpit/competitor-activity`, {
			query: buildQuery({ windowDays: query?.windowDays }),
		});
	}
}
