import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';

export type AiSearchAlertKind = 'BrandLostCitation' | 'BrandSoVDropped' | 'CompetitorOvertook';

export interface AiSearchAlertDto {
	kind: AiSearchAlertKind;
	severity: 'info' | 'warning' | 'critical';
	aiProvider: AiSearchInsights.AiProviderName;
	country: string;
	language: string;
	occurredAt: string;
	/** Type-specific subject — URL for `BrandLostCitation`, brand name for `CompetitorOvertook`. */
	subject: string;
	details: Record<string, number | string | null>;
}

export interface QueryAiSearchAlertsQuery {
	projectId: string;
	asOf?: Date;
}

const SOV_DROP_THRESHOLD = -0.2; // -20% week-over-week relative drop
const CITATION_STREAK_THRESHOLD_DAYS = 3;
const STREAK_LOOKBACK_DAYS = 30;

/**
 * Sub-issue #64 of #27 — alert evaluator.
 *
 * Computes alerts on-the-fly against the read model. No persistence, no
 * scheduled job: each call evaluates the three alert detectors fresh. That
 * trades a slightly higher API cost for zero alerting infrastructure (no
 * new tables, no cron, no notification channels). Real notifications
 * (email / Slack / PagerDuty) become a follow-up that listens to these
 * synthesised alerts via the existing event bus.
 *
 * Detectors:
 *  - **BrandLostCitation** — own URL was cited continuously for ≥3 days
 *    inside the lookback window, and the most recent capture no longer
 *    cites it.
 *  - **BrandSoVDropped** — own-brand mention rate dropped ≥20% week-over-
 *    week in some `(provider × locale)` combination AND the prior week had
 *    at least 3 captures (avoids triggering on tiny samples).
 *  - **CompetitorOvertook** — within the window, a competitor's avg
 *    position is BETTER (numerically lower) than ours in some `(provider ×
 *    locale)` AND we have at least one own mention there.
 */
export class QueryAiSearchAlertsUseCase {
	constructor(private readonly readModel: AiSearchInsights.LlmAnswerReadModel) {}

	async execute(query: QueryAiSearchAlertsQuery): Promise<readonly AiSearchAlertDto[]> {
		const asOf = query.asOf ?? new Date();
		const projectId = query.projectId as ProjectManagement.ProjectId;
		const lookback = {
			from: new Date(asOf.getTime() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
			to: asOf,
		};
		const [streaks, weeklyDelta, leads] = await Promise.all([
			this.readModel.ownCitationStreaksForProject(projectId, lookback),
			this.readModel.weeklySovDeltaForProject(projectId, asOf),
			this.readModel.positionLeadsForProject(projectId, lookback),
		]);

		const alerts: AiSearchAlertDto[] = [];

		for (const s of streaks) {
			if (s.streakDays < CITATION_STREAK_THRESHOLD_DAYS) continue;
			if (s.currentlyCited) continue;
			alerts.push({
				kind: 'BrandLostCitation',
				severity: 'warning',
				aiProvider: s.aiProvider,
				country: s.country,
				language: s.language,
				occurredAt: s.lastSeenAt.toISOString(),
				subject: s.url,
				details: {
					domain: s.domain,
					streakDays: s.streakDays,
				},
			});
		}

		for (const d of weeklyDelta) {
			if (d.lastWeekTotal < CITATION_STREAK_THRESHOLD_DAYS) continue;
			if (d.relativeDelta === null) continue;
			if (d.relativeDelta > SOV_DROP_THRESHOLD) continue;
			alerts.push({
				kind: 'BrandSoVDropped',
				severity: d.relativeDelta <= -0.5 ? 'critical' : 'warning',
				aiProvider: d.aiProvider,
				country: d.country,
				language: d.language,
				occurredAt: asOf.toISOString(),
				subject: `${d.aiProvider} · ${d.country.toLowerCase()}-${d.language}`,
				details: {
					thisWeekRate: d.thisWeekRate,
					lastWeekRate: d.lastWeekRate,
					relativeDelta: d.relativeDelta,
					thisWeekTotal: d.thisWeekTotal,
					lastWeekTotal: d.lastWeekTotal,
				},
			});
		}

		for (const l of leads) {
			if (l.ownAvgPosition === null) continue;
			if (l.competitorAvgPosition === null) continue;
			if (l.competitorAvgPosition >= l.ownAvgPosition) continue;
			alerts.push({
				kind: 'CompetitorOvertook',
				severity: 'warning',
				aiProvider: l.aiProvider,
				country: l.country,
				language: l.language,
				occurredAt: asOf.toISOString(),
				subject: l.competitorBrand,
				details: {
					ownAvgPosition: l.ownAvgPosition,
					competitorAvgPosition: l.competitorAvgPosition,
					gap: l.ownAvgPosition - l.competitorAvgPosition,
				},
			});
		}

		// Most-actionable first: critical drops, then warnings, then infos.
		const severityOrder: Record<AiSearchAlertDto['severity'], number> = {
			critical: 0,
			warning: 1,
			info: 2,
		};
		alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
		return alerts;
	}
}
