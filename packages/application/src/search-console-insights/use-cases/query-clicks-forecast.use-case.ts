import type { ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';
import { holtWinters } from '../lib/holt-winters.js';

export interface QueryClicksForecastCommand {
	projectId: string;
	historyDays?: number;
	forecastDays?: number;
}

export interface ForecastPointDto {
	day: string;
	clicks: number;
	impressions: number;
	type: 'observed' | 'forecast';
}

export interface ClicksForecastResponseDto {
	points: ForecastPointDto[];
	historyDays: number;
	forecastDays: number;
	historyClicksTotal: number;
	forecastClicksTotal: number;
	deltaPct: number | null;
}

const DEFAULT_HISTORY_DAYS = 90;
const DEFAULT_FORECAST_DAYS = 90;

/**
 * Issue #117 Sprint 4 — Forecast 90d.
 *
 * Reads the project's daily clicks/impressions for the trailing
 * `historyDays` and projects forward `forecastDays` using Holt-Winters
 * double-exponential smoothing (additive trend, no seasonality — see
 * `lib/holt-winters.ts` for the rationale).
 *
 * Fills gap days with zero before fitting: GSC sometimes has missing days
 * (especially for fresh properties or weekends with no traffic) and
 * skipping them would distort the trend the smoother fits. Better to feed
 * the smoother a "true" daily axis and let it learn the level/trend from
 * the actual zero days.
 *
 * `deltaPct` compares the SUM of forecast clicks vs the SUM of observed
 * clicks — directional only, not a per-day projection. It's what the
 * cockpit shows in the widget chip ("forecast +18% vs last 90d").
 */
export class QueryClicksForecastUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly cockpit: SearchConsoleInsights.GscCockpitReadModel,
	) {}

	async execute(cmd: QueryClicksForecastCommand): Promise<ClicksForecastResponseDto> {
		const project = await this.projects.findById(cmd.projectId as ProjectManagement.ProjectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}
		const historyDays = cmd.historyDays ?? DEFAULT_HISTORY_DAYS;
		const forecastDays = cmd.forecastDays ?? DEFAULT_FORECAST_DAYS;
		const rows = await this.cockpit.dailyTotalsForProject(project.id, historyDays);

		const observedSeries = fillDailyGaps(rows, historyDays);
		const clicksHistory = observedSeries.map((p) => p.clicks);
		const impressionsHistory = observedSeries.map((p) => p.impressions);

		const clicksForecast = holtWinters(clicksHistory, { periods: forecastDays });
		const impressionsForecast = holtWinters(impressionsHistory, { periods: forecastDays });

		const points: ForecastPointDto[] = observedSeries.map((p) => ({
			day: p.day.toISOString(),
			clicks: p.clicks,
			impressions: p.impressions,
			type: 'observed' as const,
		}));

		if (clicksForecast && impressionsForecast) {
			const lastDay = observedSeries[observedSeries.length - 1]?.day ?? new Date();
			for (let i = 0; i < forecastDays; i++) {
				const day = new Date(lastDay.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
				points.push({
					day: day.toISOString(),
					clicks: Math.round(clicksForecast.forecast[i] ?? 0),
					impressions: Math.round(impressionsForecast.forecast[i] ?? 0),
					type: 'forecast',
				});
			}
		}

		const historyClicksTotal = clicksHistory.reduce((acc, c) => acc + c, 0);
		const forecastClicksTotal = clicksForecast
			? Math.round(clicksForecast.forecast.reduce((acc, c) => acc + c, 0))
			: 0;
		const deltaPct =
			historyClicksTotal === 0
				? null
				: Math.round(((forecastClicksTotal - historyClicksTotal) / historyClicksTotal) * 1000) / 10;

		return {
			points,
			historyDays,
			forecastDays,
			historyClicksTotal,
			forecastClicksTotal,
			deltaPct,
		};
	}
}

/**
 * Pads the rolling-window series so every UTC day is present. Missing
 * days are inserted as zero-click rows. Anchored on the FIRST observed
 * day so the smoother sees a consistent daily cadence even when the
 * project's GSC linkage is fresh (which would otherwise yield a sparse
 * series).
 */
const fillDailyGaps = (
	rows: readonly SearchConsoleInsights.DailyClicksImpressionsRow[],
	windowDays: number,
): SearchConsoleInsights.DailyClicksImpressionsRow[] => {
	if (rows.length === 0) return [];
	const sorted = [...rows].sort((a, b) => a.day.getTime() - b.day.getTime());
	const start = sorted[0]?.day ?? new Date();
	const end = sorted[sorted.length - 1]?.day ?? new Date();
	const totalDays = Math.min(
		windowDays,
		Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
	);
	const byKey = new Map<string, SearchConsoleInsights.DailyClicksImpressionsRow>();
	for (const r of sorted) byKey.set(r.day.toISOString().slice(0, 10), r);

	const filled: SearchConsoleInsights.DailyClicksImpressionsRow[] = [];
	for (let i = 0; i < totalDays; i++) {
		const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
		const key = day.toISOString().slice(0, 10);
		filled.push(
			byKey.get(key) ?? {
				day,
				clicks: 0,
				impressions: 0,
			},
		);
	}
	return filled;
};
