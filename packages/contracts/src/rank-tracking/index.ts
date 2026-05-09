import { z } from 'zod';

/**
 * Optional auto-schedule envelope. When present, the controller will also
 * create a JobDefinition wired to the tracked keyword
 * (`params.trackedKeywordId`) so the worker materializes RankingObservation
 * rows on every fetch — no need for a second POST /providers/.../schedule
 * call (BACKLOG #9 opción A).
 */
export const AutoScheduleSerp = z.object({
	providerId: z.string().min(1),
	endpointId: z.string().min(1),
	cron: z.string().min(5).max(80),
	/** Provider-specific params (e.g. DataForSEO needs keyword + locationCode + languageCode + device). */
	params: z.record(z.string(), z.unknown()),
	credentialOverrideId: z.string().uuid().nullable().optional(),
});
export type AutoScheduleSerp = z.infer<typeof AutoScheduleSerp>;

export const StartTrackingKeywordRequest = z.object({
	projectId: z.string().uuid(),
	domain: z.string().min(3).max(253),
	phrase: z.string().min(1).max(200),
	country: z.string().regex(/^[A-Z]{2}$/),
	language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	device: z.enum(['desktop', 'mobile']).optional(),
	autoSchedule: AutoScheduleSerp.optional(),
});
export type StartTrackingKeywordRequest = z.infer<typeof StartTrackingKeywordRequest>;

export const StartTrackingKeywordResponse = z.object({
	trackedKeywordId: z.string(),
	scheduledDefinitionId: z.string().nullable(),
});
export type StartTrackingKeywordResponse = z.infer<typeof StartTrackingKeywordResponse>;

export const RankingHistoryQuery = z.object({
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
});
export type RankingHistoryQuery = z.infer<typeof RankingHistoryQuery>;

export const RankingHistoryEntryDto = z.object({
	observedAt: z.string().datetime(),
	position: z.number().nullable(),
	url: z.string().nullable(),
	serpFeatures: z.array(z.string()).readonly(),
	sourceProvider: z.string(),
});
export type RankingHistoryEntryDto = z.infer<typeof RankingHistoryEntryDto>;

// --- SERP Map (issue #115) ---

export const SerpMapQuery = z.object({
	phrase: z.string().min(1).optional(),
	country: z
		.string()
		.regex(/^[A-Z]{2}$/)
		.optional(),
	language: z
		.string()
		.regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
		.optional(),
	windowDays: z.coerce.number().int().min(1).max(30).optional(),
});
export type SerpMapQuery = z.infer<typeof SerpMapQuery>;

export const SerpResultClassification = z.enum(['own', 'competitor', 'other']);
export type SerpResultClassification = z.infer<typeof SerpResultClassification>;

export const SerpMapResultDto = z.object({
	rank: z.number().int().min(1),
	domain: z.string(),
	url: z.string().nullable(),
	title: z.string().nullable(),
	classification: SerpResultClassification,
	competitorLabel: z.string().nullable(),
});
export type SerpMapResultDto = z.infer<typeof SerpMapResultDto>;

export const SerpMapRowDto = z.object({
	phrase: z.string(),
	country: z.string(),
	language: z.string(),
	device: z.enum(['desktop', 'mobile']),
	observedAt: z.string().datetime(),
	results: z.array(SerpMapResultDto),
});
export type SerpMapRowDto = z.infer<typeof SerpMapRowDto>;

export const SerpMapResponse = z.object({
	rows: z.array(SerpMapRowDto),
});
export type SerpMapResponse = z.infer<typeof SerpMapResponse>;

export const SerpCompetitorSuggestionsQuery = z.object({
	minDistinctKeywords: z.coerce.number().int().min(1).max(50).optional(),
	windowDays: z.coerce.number().int().min(1).max(30).optional(),
});
export type SerpCompetitorSuggestionsQuery = z.infer<typeof SerpCompetitorSuggestionsQuery>;

export const SerpCompetitorSuggestionDto = z.object({
	domain: z.string(),
	distinctKeywords: z.number().int().min(1),
	totalAppearances: z.number().int().min(1),
	bestRank: z.number().int().min(1),
	sampleUrl: z.string().nullable(),
});
export type SerpCompetitorSuggestionDto = z.infer<typeof SerpCompetitorSuggestionDto>;

export const SerpCompetitorSuggestionsResponse = z.object({
	suggestions: z.array(SerpCompetitorSuggestionDto),
});
export type SerpCompetitorSuggestionsResponse = z.infer<typeof SerpCompetitorSuggestionsResponse>;

// --- Ranked Keywords (issue #127) ---

export const RankedKeywordsQuery = z.object({
	targetDomain: z.string().min(3).max(253),
	limit: z.coerce.number().int().min(1).max(1000).optional(),
	minVolume: z.coerce.number().int().min(0).optional(),
});
export type RankedKeywordsQuery = z.infer<typeof RankedKeywordsQuery>;

export const RankedKeywordsResponseEntry = z.object({
	keyword: z.string(),
	position: z.number().int().nullable(),
	searchVolume: z.number().int().nullable(),
	keywordDifficulty: z.number().int().nullable(),
	trafficEstimate: z.number().nullable(),
	cpc: z.number().nullable(),
	rankingUrl: z.string().nullable(),
	observedAt: z.string().datetime(),
});
export type RankedKeywordsResponseEntry = z.infer<typeof RankedKeywordsResponseEntry>;

export const RankedKeywordsResponse = z.object({
	rows: z.array(RankedKeywordsResponseEntry),
});
export type RankedKeywordsResponse = z.infer<typeof RankedKeywordsResponse>;

// --- Search Demand Trend (issue #117 Sprint 4) ---

export const SearchDemandTrendQuery = z.object({
	months: z.coerce.number().int().min(2).max(36).optional(),
	targetDomain: z.string().min(3).max(253).optional(),
});
export type SearchDemandTrendQuery = z.infer<typeof SearchDemandTrendQuery>;

export const SearchDemandPointDto = z.object({
	month: z.string().datetime(),
	totalVolume: z.number().int().nonnegative(),
	distinctKeywords: z.number().int().nonnegative(),
});
export type SearchDemandPointDto = z.infer<typeof SearchDemandPointDto>;

export const SearchDemandTrendResponse = z.object({
	points: z.array(SearchDemandPointDto),
	latestVolume: z.number().int().nonnegative(),
	previousVolume: z.number().int().nonnegative(),
	deltaPct: z.number().nullable(),
});
export type SearchDemandTrendResponse = z.infer<typeof SearchDemandTrendResponse>;
