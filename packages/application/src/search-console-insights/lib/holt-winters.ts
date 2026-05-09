/**
 * Holt-Winters double-exponential smoothing — additive trend, no
 * seasonality. Pure function over a time-series of length ≥ 2.
 *
 * Smoothing constants:
 *   - `alpha` = level smoothing (0..1). Higher = react faster to recent
 *     observations, lower = smoother but slower.
 *   - `beta`  = trend smoothing (0..1). Same trade-off for the slope.
 *
 * Defaults `alpha = 0.3`, `beta = 0.1` are conservative — they suppress
 * noise on noisy GSC daily series while still tracking real shifts. We
 * deliberately don't fit them per project: the cockpit forecast is a
 * 90-day directional indicator, not a model the operator should second-
 * guess. If a project's series is so erratic the defaults break, the
 * operator should look at the actual GSC dashboard, not this widget.
 *
 * Returns `null` when there's not enough data to fit the model
 * (caller surfaces an empty-state). The minimum is ARBITRARY but small:
 * with one point we have no trend; with two points we have one trend
 * sample and the smoother is already valid.
 *
 * Why not seasonality (Holt-Winters triple): GSC traffic in most niches
 * has weekly seasonality (weekend dip), but fitting requires ≥ 2 cycles
 * (~14 days) of clean data and the cockpit shouldn't refuse to draw a
 * line for a brand-new project. The double-smoothing version handles
 * trend without needing a seasonal estimate; weekly bumps will show as
 * residual noise in the observed series and the forecast will be a
 * straight projection. Ship the simpler model; add seasonality later
 * if operators ask for it.
 */
export interface HoltWintersOptions {
	readonly alpha?: number;
	readonly beta?: number;
	readonly periods: number;
}

export interface HoltWintersForecast {
	readonly level: number;
	readonly trend: number;
	readonly fitted: number[];
	readonly forecast: number[];
}

export const holtWinters = (
	history: readonly number[],
	opts: HoltWintersOptions,
): HoltWintersForecast | null => {
	if (history.length < 2) return null;
	const alpha = opts.alpha ?? 0.3;
	const beta = opts.beta ?? 0.1;
	const periods = opts.periods;
	if (periods < 1) {
		return { level: history[history.length - 1] ?? 0, trend: 0, fitted: [...history], forecast: [] };
	}

	let level = history[0] ?? 0;
	let trend = (history[1] ?? 0) - (history[0] ?? 0);
	const fitted: number[] = [level];

	for (let i = 1; i < history.length; i++) {
		const point = history[i] ?? 0;
		const newLevel = alpha * point + (1 - alpha) * (level + trend);
		const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
		level = newLevel;
		trend = newTrend;
		fitted.push(level);
	}

	const forecast: number[] = [];
	for (let i = 1; i <= periods; i++) {
		// Clamp to ≥ 0 — clicks/impressions can never be negative, and the
		// smoother CAN extrapolate negative when the trend is strongly
		// downward and `level` is small.
		forecast.push(Math.max(0, level + i * trend));
	}

	return { level, trend, fitted, forecast };
};
