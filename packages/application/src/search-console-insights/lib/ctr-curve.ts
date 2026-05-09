/**
 * CTR by SERP position (Advanced Web Ranking 2024 study, simplified).
 *
 * Used by the cockpit read models (Lost Opportunity Score, Quick-Win ROI,
 * CTR Anomaly Detector) to translate "what would I earn at top-3 vs my
 * current position?" into a projected click figure. Numbers are percentages
 * (e.g. `28` = 28% expected CTR for #1).
 *
 * Centralised here so the SPA's opportunities page and the cockpit widgets
 * agree on the curve — drift between them would produce contradictory
 * "lost-opportunity" estimates.
 */
const CTR_BY_POSITION: Record<number, number> = {
	1: 28,
	2: 15,
	3: 11,
	4: 8,
	5: 6,
	6: 4.5,
	7: 3.5,
	8: 2.8,
	9: 2.4,
	10: 2,
	11: 1.6,
	12: 1.4,
	13: 1.2,
	14: 1.05,
	15: 0.9,
	16: 0.8,
	17: 0.7,
	18: 0.62,
	19: 0.55,
	20: 0.5,
	21: 0.45,
	22: 0.4,
	23: 0.36,
	24: 0.32,
	25: 0.3,
	26: 0.27,
	27: 0.25,
	28: 0.22,
	29: 0.2,
	30: 0.18,
};

export const ctrForPosition = (position: number): number => {
	if (!Number.isFinite(position) || position < 1) return 0;
	if (position > 30) return 0.1;
	return CTR_BY_POSITION[Math.round(position)] ?? 0;
};

/**
 * Default "target" position used as the comparison baseline in the
 * Lost-Opportunity / Quick-Win read models. Top-3 is the inflection point
 * where CTR triples vs #4-#10, so it represents the pragmatic ceiling
 * for click recovery.
 */
export const DEFAULT_TARGET_POSITION = 3;
