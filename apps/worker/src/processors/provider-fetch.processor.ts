import type {
	AiSearchInsights as AiSearchInsightsUseCases,
	BingWebmasterInsights as BingWebmasterInsightsUseCases,
	EntityAwareness as EntityAwarenessUseCases,
	ExperienceAnalytics as ExperienceAnalyticsUseCases,
	MacroContext as MacroContextUseCases,
	MetaAdsAttribution as MetaAdsAttributionUseCases,
	ProjectManagement as ProjectManagementUseCases,
	ProviderConnectivity as ProviderConnectivityUseCases,
	RankTracking as RankTrackingUseCases,
	SearchConsoleInsights as SearchConsoleInsightsUseCases,
	TrafficAnalytics as TrafficAnalyticsUseCases,
	WebPerformance as WebPerformanceUseCases,
} from '@rankpulse/application';
import {
	type BingWebmasterInsights as BingWebmasterInsightsDomain,
	type EntityAwareness as EntityAwarenessDomain,
	type ExperienceAnalytics as ExperienceAnalyticsDomain,
	type MacroContext as MacroContextDomain,
	type MetaAdsAttribution as MetaAdsAttributionDomain,
	type ProjectManagement,
	ProviderConnectivity,
	type RankTracking as RankTrackingDomain,
	type SearchConsoleInsights as SearchConsoleInsightsDomain,
	type TrafficAnalytics as TrafficAnalyticsDomain,
	type WebPerformance as WebPerformanceDomain,
} from '@rankpulse/domain';
import type { ProviderFetchJobData } from '@rankpulse/infrastructure/queue';
import {
	AnthropicApiError,
	type AnthropicMessagesPayload,
	normaliseAnthropicResponse,
} from '@rankpulse/provider-anthropic';
import {
	BingApiError,
	extractDailyRows as extractBingDailyRows,
	type RankAndTrafficStatsResponse,
} from '@rankpulse/provider-bing';
import {
	CloudflareRadarApiError,
	type DomainRankResponse,
	extractSnapshot as extractRadarSnapshot,
} from '@rankpulse/provider-cloudflare-radar';
import type { ProviderRegistry } from '@rankpulse/provider-core';
import {
	DataForSeoApiError,
	extractTop10Domains,
	type SerpLiveResponse,
} from '@rankpulse/provider-dataforseo';
import {
	extractRows as extractGa4Rows,
	Ga4ApiError,
	type RunReportParams,
	type RunReportResponse,
} from '@rankpulse/provider-ga4';
import {
	type GeminiPayload,
	GoogleAiStudioApiError,
	normaliseGeminiResponse,
} from '@rankpulse/provider-google-ai-studio';
import {
	extractGscRows,
	GscApiError,
	type SearchAnalyticsParams,
	type SearchAnalyticsResponse,
} from '@rankpulse/provider-gsc';
import {
	type AdsInsightsParams,
	type AdsInsightsResponse,
	extractAdsInsightRows,
	extractPixelEventRows,
	MetaApiError,
	type PixelEventsStatsParams,
	type PixelEventsStatsResponse,
} from '@rankpulse/provider-meta';
import {
	ClarityApiError,
	type DataExportResponse,
	extractSnapshot as extractClaritySnapshot,
} from '@rankpulse/provider-microsoft-clarity';
import {
	normaliseOpenAiResponse,
	OpenAiApiError,
	type OpenAiResponsePayload,
} from '@rankpulse/provider-openai';
import { extractSnapshot, PageSpeedApiError, type RunPagespeedResponse } from '@rankpulse/provider-pagespeed';
import {
	normalisePerplexityResponse,
	PerplexityApiError,
	type PerplexityChatPayload,
} from '@rankpulse/provider-perplexity';
import {
	extractPageviews,
	type PageviewsPerArticleResponse,
	WikipediaApiError,
} from '@rankpulse/provider-wikipedia';
import { type Clock, type IdGenerator, NotFoundError, resolveDateTokens } from '@rankpulse/shared';
import type { Logger } from 'pino';
import { extractMultiDomainRankings, isMultiDomainSerpJob } from './extract-multi-domain-rankings.js';

/**
 * BACKLOG #14: detect provider-side "out of quota / payment required" so the
 * processor stops retrying AND the job definition is auto-paused — otherwise
 * BullMQ keeps hammering the upstream and the same error fills the run log.
 *
 * Covers:
 *   - HTTP 402 from any provider (universal "out of credit" code).
 *   - DataForSEO body status_code in the 402xx / 403xx / 405xx ranges.
 *     DataForSEO returns HTTP 200 with body status_code 40402 ("no
 *     balance"), 40501 ("monthly limit reached") and similar — these are
 *     surfaced as DataForSeoApiError by `ensureTaskOk`. Without this
 *     check the worker treats them as transient and retries forever.
 */
const isQuotaExhaustedError = (err: unknown): boolean => {
	if (err instanceof DataForSeoApiError) {
		if (err.status === 402) return true;
		// Body status codes: 40402, 40403, 40501, 40502 — quota / billing.
		// 40000-40399 are validation / auth which ARE worth retrying after
		// the operator fixes them.
		if (err.status >= 40400 && err.status < 41000) return true;
		if (err.status >= 40500 && err.status < 41000) return true;
	}
	if (err instanceof GscApiError && err.status === 402) return true;
	// Wikipedia is a public API, no quota; included for symmetry.
	if (err instanceof WikipediaApiError && err.status === 402) return true;
	// PSI returns 429 once the API key burns through its 25k/day. Treat as
	// quota-exhausted so the JobDefinition auto-pauses until next day.
	if (err instanceof PageSpeedApiError && (err.status === 402 || err.status === 429)) return true;
	// GA4 Data API returns 429 RESOURCE_EXHAUSTED when the per-property token
	// budget (200k/day) is spent; auto-pause until reset.
	if (err instanceof Ga4ApiError && (err.status === 402 || err.status === 429)) return true;
	// Bing Webmaster Tools is fair-use rate-limited; 429 is the throttle
	// signal. Treat it as quota-exhausted so the cron auto-pauses rather than
	// retrying through the budget for the rest of the day.
	if (err instanceof BingApiError && err.status === 429) return true;
	// Cloudflare Radar enforces per-account rate limits at the platform edge;
	// 429 is the throttle signal. Auto-pause until the operator topples up.
	if (err instanceof CloudflareRadarApiError && (err.status === 402 || err.status === 429)) return true;
	// Meta Marketing API: 80004 / 17 / 4 = "rate limit reached" surfaced as
	// HTTP 400 with a specific subcode (not normalised yet); the platform
	// also returns a hard 429 once the Business Use Case bucket spills.
	// We auto-pause on 402/429 so the cron stops drilling through quota.
	if (err instanceof MetaApiError && (err.status === 402 || err.status === 429)) return true;
	// Microsoft Clarity allows 10 req/day per project on the free tier;
	// 429 once the budget is spent. Auto-pause until the next day window.
	if (err instanceof ClarityApiError && (err.status === 402 || err.status === 429)) return true;
	// OpenAI returns 429 (rate limit) and 401/403 (key revoked/no quota); all
	// non-recoverable without operator action.
	if (err instanceof OpenAiApiError && (err.status === 402 || err.status === 429)) return true;
	// Anthropic returns 429 (rate limit / monthly cap), 402 (over-balance).
	if (err instanceof AnthropicApiError && (err.status === 402 || err.status === 429)) return true;
	// Perplexity returns 429 once the requests-per-minute or monthly request
	// quota is hit. Auto-pause until the operator tops up.
	if (err instanceof PerplexityApiError && (err.status === 402 || err.status === 429)) return true;
	// Google AI Studio (Gemini) returns 429 RESOURCE_EXHAUSTED when the
	// per-project rate or daily-grounding quota is spent. Auto-pause.
	if (err instanceof GoogleAiStudioApiError && (err.status === 402 || err.status === 429)) return true;
	return false;
};

const normalize = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/^www\./, '');

export interface ProviderFetchProcessorDeps {
	registry: ProviderRegistry;
	credentialRepo: ProviderConnectivity.CredentialRepository;
	jobDefRepo: ProviderConnectivity.JobDefinitionRepository;
	jobRunRepo: ProviderConnectivity.JobRunRepository;
	rawPayloadRepo: ProviderConnectivity.RawPayloadRepository;
	apiUsageRepo: ProviderConnectivity.ApiUsageRepository;
	trackedKeywordRepo: RankTrackingDomain.TrackedKeywordRepository;
	competitorRepo: ProjectManagement.CompetitorRepository;
	gscPropertyRepo: SearchConsoleInsightsDomain.GscPropertyRepository;
	wikipediaArticleRepo: EntityAwarenessDomain.WikipediaArticleRepository;
	trackedPageRepo: WebPerformanceDomain.TrackedPageRepository;
	ga4PropertyRepo: TrafficAnalyticsDomain.Ga4PropertyRepository;
	bingPropertyRepo: BingWebmasterInsightsDomain.BingPropertyRepository;
	monitoredDomainRepo: MacroContextDomain.MonitoredDomainRepository;
	metaPixelRepo: MetaAdsAttributionDomain.MetaPixelRepository;
	metaAdAccountRepo: MetaAdsAttributionDomain.MetaAdAccountRepository;
	clarityProjectRepo: ExperienceAnalyticsDomain.ClarityProjectRepository;
	vault: ProviderConnectivity.CredentialVault;
	resolveCredentialUseCase: ProviderConnectivityUseCases.ResolveProviderCredentialUseCase;
	recordApiUsageUseCase: ProviderConnectivityUseCases.RecordApiUsageUseCase;
	recordRankingObservationUseCase: RankTrackingUseCases.RecordRankingObservationUseCase;
	recordTop10HitsForSuggestionsUseCase: ProjectManagementUseCases.RecordTop10HitsForSuggestionsUseCase;
	ingestGscRowsUseCase: SearchConsoleInsightsUseCases.IngestGscRowsUseCase;
	ingestWikipediaPageviewsUseCase: EntityAwarenessUseCases.IngestWikipediaPageviewsUseCase;
	recordPageSpeedSnapshotUseCase: WebPerformanceUseCases.RecordPageSpeedSnapshotUseCase;
	ingestGa4RowsUseCase: TrafficAnalyticsUseCases.IngestGa4RowsUseCase;
	ingestBingTrafficUseCase: BingWebmasterInsightsUseCases.IngestBingTrafficUseCase;
	recordRadarRankUseCase: MacroContextUseCases.RecordRadarRankUseCase;
	ingestMetaPixelEventsUseCase: MetaAdsAttributionUseCases.IngestMetaPixelEventsUseCase;
	ingestMetaAdsInsightsUseCase: MetaAdsAttributionUseCases.IngestMetaAdsInsightsUseCase;
	recordExperienceSnapshotUseCase: ExperienceAnalyticsUseCases.RecordExperienceSnapshotUseCase;
	recordLlmAnswerUseCase: AiSearchInsightsUseCases.RecordLlmAnswerUseCase;
	clock: Clock;
	ids: IdGenerator;
	logger: Logger;
}

/**
 * BullMQ job processor that fetches one (definition × tick) provider call,
 * persists the raw payload, records cost, and (for endpoints that produce
 * ranking observations) feeds the rank-tracking ACL to materialize a typed
 * observation. Idempotent at the request_hash level so duplicate ticks do
 * not double-charge.
 */
export class ProviderFetchProcessor {
	constructor(private readonly deps: ProviderFetchProcessorDeps) {}

	async handle(data: ProviderFetchJobData): Promise<void> {
		const definition = await this.deps.jobDefRepo.findById(
			data.definitionId as ProviderConnectivity.ProviderJobDefinitionId,
		);
		if (!definition) {
			throw new NotFoundError(`Job definition ${data.definitionId} not found`);
		}
		// Pre-bind defId/runId/providerId/endpointId on a child logger so
		// every line emitted during this run carries the same correlation
		// keys. Without this, debugging concurrent runs (default
		// WORKER_CONCURRENCY=4) means cross-referencing interleaved logs
		// by hand.
		const log = this.deps.logger.child({
			defId: definition.id,
			providerId: definition.providerId.value,
			endpointId: definition.endpointId.value,
		});
		if (!definition.enabled) {
			log.info({}, 'job definition disabled, skipping');
			return;
		}

		const provider = this.deps.registry.get(definition.providerId.value);
		const endpointDescriptor = this.deps.registry.endpoint(
			definition.providerId.value,
			definition.endpointId.value,
		);
		const params = definition.params as { organizationId?: string };

		const orgId = params.organizationId;
		if (!orgId) {
			throw new Error(`Job definition ${definition.id} missing organizationId in systemParams`);
		}

		const resolved = await this.deps.resolveCredentialUseCase.execute({
			organizationId: orgId,
			providerId: definition.providerId.value,
			hints: { projectId: definition.projectId },
			overrideCredentialId: definition.credentialOverrideId,
		});

		const runId = (data.runId ?? this.deps.ids.generate()) as ProviderConnectivity.ProviderJobRunId;
		const runLog = log.child({ runId });
		const run = ProviderConnectivity.ProviderJobRun.start({
			id: runId,
			definitionId: definition.id,
			credentialId: resolved.credentialId as ProviderConnectivity.ProviderCredentialId,
			now: this.deps.clock.now(),
		});
		await this.deps.jobRunRepo.save(run);

		const dateBucket = this.deps.clock.now().toISOString().slice(0, 10);
		// BACKLOG #22: definitions persist relative date tokens (e.g.
		// `endDate: "{{today-2}}"`). Resolve them ONCE here against the
		// current wall clock and use the resolved params for both the
		// request-hash (so idempotency keys differ across days) and the
		// fetch call. Persisted `definition.params` stays unchanged so the
		// next cron tick recomputes against tomorrow's date.
		const resolvedParams = resolveDateTokens(
			definition.params as Record<string, unknown>,
			this.deps.clock.now(),
		);
		const requestHash = ProviderConnectivity.computeRequestHashFor(
			definition.providerId,
			definition.endpointId,
			resolvedParams,
			dateBucket,
		);
		const existing = await this.deps.rawPayloadRepo.findByRequestHash(requestHash);
		if (existing) {
			runLog.info({ requestHash }, 'idempotent skip');
			run.complete(existing.id, this.deps.clock.now());
			await this.deps.jobRunRepo.save(run);
			return;
		}

		// Hard timeout per fetch. Without this a hung provider (DNS,
		// stuck TCP, infinite redirect) holds a BullMQ concurrency slot
		// indefinitely — eventually starves the worker. 60s is generous
		// for the slowest endpoints (on-page audit) and tight enough for
		// the fast ones (SERP).
		const timeoutSignal = AbortSignal.timeout(60_000);
		try {
			const fetchResult = await provider.fetch(definition.endpointId.value, resolvedParams, {
				credential: { plaintextSecret: resolved.plaintextSecret },
				logger: {
					debug: (msg, meta) => runLog.debug(meta ?? {}, msg),
					warn: (msg, meta) => runLog.warn(meta ?? {}, msg),
				},
				signal: timeoutSignal,
				now: () => this.deps.clock.now(),
			});

			const rawPayloadId = this.deps.ids.generate() as ProviderConnectivity.RawPayloadId;
			const rawPayload = ProviderConnectivity.RawPayload.store({
				id: rawPayloadId,
				providerId: definition.providerId,
				endpointId: definition.endpointId,
				params: resolvedParams,
				dateBucket,
				payload: fetchResult,
				now: this.deps.clock.now(),
			});
			await this.deps.rawPayloadRepo.save(rawPayload);

			// BACKLOG #4 fix — endpoints that bill per item (e.g. search-volume
			// at $0.005/keyword) declare a `costFor(params)` that returns the
			// real cost for THIS call. Falls back to `cost.amount` (worst-case)
			// for endpoints with flat per-call billing OR if costFor throws
			// on a malformed params shape (we charge worst-case AND log so
			// the operator sees the misconfigure).
			let realCostCents = endpointDescriptor.cost.amount;
			if (endpointDescriptor.costFor) {
				try {
					realCostCents = endpointDescriptor.costFor(resolvedParams);
				} catch (err) {
					runLog.warn(
						{ err: err instanceof Error ? err.message : String(err) },
						'costFor() threw on resolvedParams — billing worst-case for this run',
					);
				}
			}
			await this.deps.recordApiUsageUseCase.execute({
				organizationId: orgId,
				credentialId: resolved.credentialId,
				projectId: definition.projectId,
				providerId: definition.providerId.value,
				endpointId: definition.endpointId.value,
				calls: 1,
				costCents: realCostCents,
			});

			if (
				definition.providerId.value === 'dataforseo' &&
				definition.endpointId.value === 'serp-google-organic-live'
			) {
				// BACKLOG #15 — fan-out: 1 SERP fetch → N RankingObservations,
				// one per project domain currently tracked for this query.
				// `(projectId, phrase, country, language, device)` arrives via
				// `systemParams` (merged into resolvedParams). The Zod schema
				// of the endpoint already validated the DataForSEO query
				// fields (`keyword`, `locationCode`, `languageCode`, `device`,
				// `depth`); fan-out fields are orchestration-only and live in
				// systemParams.
				if (!isMultiDomainSerpJob(resolvedParams as Record<string, string>)) {
					throw new Error(
						`SERP job ${definition.id} missing fan-out systemParams ` +
							`(projectId, phrase, country, language, device)`,
					);
				}
				const fanOutKey = resolvedParams as {
					projectId: ProjectManagement.ProjectId;
					phrase: string;
					country: string;
					language: string;
					device: string;
				};
				const tracked = await this.deps.trackedKeywordRepo.listByProjectQuery(fanOutKey);
				const extractions = extractMultiDomainRankings(fetchResult as SerpLiveResponse, tracked);
				for (const e of extractions) {
					await this.deps.recordRankingObservationUseCase.execute({
						trackedKeywordId: e.trackedKeywordId,
						position: e.extraction.position,
						url: e.extraction.url,
						serpFeatures: e.extraction.serpFeatures,
						sourceProvider: definition.providerId.value,
						rawPayloadId,
					});
				}

				// BACKLOG #18 — auto-discover competitors. Top-10 domains that
				// are NOT in the project's own tracked set AND NOT already
				// promoted competitors get recorded as suggestions. The use
				// case is idempotent on (project, domain): it bumps the
				// existing tally or starts a new PENDING row.
				const top10 = extractTop10Domains(fetchResult as SerpLiveResponse);
				if (top10.length > 0) {
					const ownDomains = new Set(tracked.map((tk) => normalize(tk.domain.value)));
					const competitors = await this.deps.competitorRepo.listForProject(fanOutKey.projectId);
					const competitorDomains = new Set(competitors.map((c) => normalize(c.domain.value)));
					const external = top10.filter((d) => !ownDomains.has(d) && !competitorDomains.has(d));
					if (external.length > 0) {
						await this.deps.recordTop10HitsForSuggestionsUseCase.execute({
							projectId: fanOutKey.projectId,
							keyword: fanOutKey.phrase,
							externalDomainsInTop10: external,
						});
					}
				}
			}

			if (definition.providerId.value === 'pagespeed' && definition.endpointId.value === 'psi-runpagespeed') {
				// Issue #18 — Core Web Vitals. The job's systemParams must
				// carry `trackedPageId` (set when the operator tracks a
				// page via the API/UI). Missing-id case logs warn + skips.
				const psiParams = resolvedParams as { trackedPageId?: string };
				if (!psiParams.trackedPageId) {
					runLog.warn({}, 'psi-runpagespeed job missing trackedPageId in systemParams; skipping ingest');
				} else {
					const snapshot = extractSnapshot(fetchResult as RunPagespeedResponse, this.deps.clock.now());
					await this.deps.recordPageSpeedSnapshotUseCase.execute({
						trackedPageId: psiParams.trackedPageId,
						observedAt: snapshot.observedAt,
						lcpMs: snapshot.lcpMs,
						inpMs: snapshot.inpMs,
						cls: snapshot.cls,
						fcpMs: snapshot.fcpMs,
						ttfbMs: snapshot.ttfbMs,
						performanceScore: snapshot.performanceScore,
						seoScore: snapshot.seoScore,
						accessibilityScore: snapshot.accessibilityScore,
						bestPracticesScore: snapshot.bestPracticesScore,
					});
				}
			}

			if (
				definition.providerId.value === 'wikipedia' &&
				definition.endpointId.value === 'wikipedia-pageviews-per-article'
			) {
				// Issue #33 — entity-awareness ingest. The job's
				// systemParams must carry `wikipediaArticleId` (set by
				// LinkWikipediaArticleUseCase via auto-schedule on link;
				// for now the schedule API caller is responsible for it).
				const wpParams = resolvedParams as { wikipediaArticleId?: string };
				if (!wpParams.wikipediaArticleId) {
					runLog.warn(
						{},
						'wikipedia-pageviews job missing wikipediaArticleId in systemParams; skipping ingest',
					);
				} else {
					const observations = extractPageviews(fetchResult as PageviewsPerArticleResponse);
					await this.deps.ingestWikipediaPageviewsUseCase.execute({
						articleId: wpParams.wikipediaArticleId,
						rows: observations.map((o) => ({
							observedAt: o.observedAt,
							views: o.views,
							access: o.access,
							agent: o.agent,
							granularity: o.granularity,
						})),
					});
				}
			}

			if (
				definition.providerId.value === 'google-search-console' &&
				definition.endpointId.value === 'gsc-search-analytics'
			) {
				// Use the RESOLVED params: extractGscRows uses startDate/endDate
				// to bucket the rows, and the persisted definition keeps the
				// token form. `gscPropertyId` is a literal string in both.
				const gscParams = resolvedParams as unknown as SearchAnalyticsParams & { gscPropertyId?: string };
				if (!gscParams.gscPropertyId) {
					runLog.warn({}, 'gsc-search-analytics job missing gscPropertyId param; skipping ingest');
				} else {
					const rows = extractGscRows(fetchResult as SearchAnalyticsResponse, {
						dimensions: gscParams.dimensions ?? ['date'],
						startDate: gscParams.startDate,
						endDate: gscParams.endDate,
					});
					await this.deps.ingestGscRowsUseCase.execute({
						gscPropertyId: gscParams.gscPropertyId,
						rawPayloadId,
						rows,
					});
				}
			}

			if (
				definition.providerId.value === 'microsoft-clarity' &&
				definition.endpointId.value === 'clarity-data-export'
			) {
				// Issue #43 — experience-analytics ingest. The job's systemParams
				// must carry `clarityProjectId`. The ACL needs an observed date,
				// which we pin to the cron's wall-clock day (Clarity returns
				// aggregated metrics over the requested numOfDays window — we
				// stamp it as the day the cron fired).
				const clarityParams = resolvedParams as { clarityProjectId?: string };
				if (!clarityParams.clarityProjectId) {
					runLog.warn(
						{},
						'clarity-data-export job missing clarityProjectId in systemParams; skipping ingest',
					);
				} else {
					const observedDate = this.deps.clock.now().toISOString().slice(0, 10);
					const snap = extractClaritySnapshot(fetchResult as DataExportResponse, observedDate);
					await this.deps.recordExperienceSnapshotUseCase.execute({
						clarityProjectId: clarityParams.clarityProjectId,
						observedDate: snap.observedDate,
						sessionsCount: snap.sessionsCount,
						botSessionsCount: snap.botSessionsCount,
						distinctUserCount: snap.distinctUserCount,
						pagesPerSession: snap.pagesPerSession,
						rageClicks: snap.rageClicks,
						deadClicks: snap.deadClicks,
						avgEngagementSeconds: snap.avgEngagementSeconds,
						avgScrollDepth: snap.avgScrollDepth,
						rawPayloadId,
					});
				}
			}

			if (
				definition.providerId.value === 'cloudflare-radar' &&
				definition.endpointId.value === 'radar-domain-rank'
			) {
				// Issue #25 — macro-context (Cloudflare Radar) ingest. The job's
				// systemParams must carry `monitoredDomainId` (set by AddMonitored
				// Domain via auto-schedule on add). Missing-id case logs warn +
				// skips, mirroring the other providers.
				const cfParams = resolvedParams as { monitoredDomainId?: string };
				if (!cfParams.monitoredDomainId) {
					runLog.warn({}, 'radar-domain-rank job missing monitoredDomainId in systemParams; skipping ingest');
				} else {
					const snap = extractRadarSnapshot(fetchResult as DomainRankResponse, this.deps.clock.now());
					await this.deps.recordRadarRankUseCase.execute({
						monitoredDomainId: cfParams.monitoredDomainId,
						observedDate: snap.observedDate,
						rank: snap.rank,
						bucket: snap.bucket,
						categories: snap.categories,
						rawPayloadId,
					});
				}
			}

			if (
				definition.providerId.value === 'bing-webmaster' &&
				definition.endpointId.value === 'bing-rank-and-traffic-stats'
			) {
				// Issue #20 — Bing daily-traffic ingest. The job's systemParams
				// must carry `bingPropertyId` (set by LinkBingProperty via
				// auto-schedule on link). The query-stats endpoint uses a
				// different aggregation shape and is wired separately when we
				// add a query-history dispatch.
				const bingParams = resolvedParams as { bingPropertyId?: string };
				if (!bingParams.bingPropertyId) {
					runLog.warn(
						{},
						'bing-rank-and-traffic-stats job missing bingPropertyId in systemParams; skipping ingest',
					);
				} else {
					const rows = extractBingDailyRows(fetchResult as RankAndTrafficStatsResponse);
					await this.deps.ingestBingTrafficUseCase.execute({
						bingPropertyId: bingParams.bingPropertyId,
						rawPayloadId,
						rows,
					});
				}
			}

			if (
				definition.providerId.value === 'google-analytics-4' &&
				definition.endpointId.value === 'ga4-run-report'
			) {
				// Issue #17 — GA4 ingest. The job's systemParams must carry
				// `ga4PropertyId` (set when the operator links a GA4 property
				// via the API/UI; the LinkGa4PropertyUseCase auto-schedules
				// the cron and stamps that id into the params).
				const ga4Params = resolvedParams as unknown as RunReportParams & { ga4PropertyId?: string };
				if (!ga4Params.ga4PropertyId) {
					runLog.warn({}, 'ga4-run-report job missing ga4PropertyId param; skipping ingest');
				} else {
					const rows = extractGa4Rows(fetchResult as RunReportResponse, {
						startDate: ga4Params.startDate,
						endDate: ga4Params.endDate,
					});
					await this.deps.ingestGa4RowsUseCase.execute({
						ga4PropertyId: ga4Params.ga4PropertyId,
						rawPayloadId,
						rows: rows.map((r) => ({
							observedDate: r.observedDate,
							dimensions: r.dimensions,
							metrics: r.metrics,
						})),
					});
				}
			}

			if (
				definition.providerId.value === 'meta' &&
				definition.endpointId.value === 'meta-pixel-events-stats'
			) {
				// Issue #45 — Meta Pixel daily-events ingest. The job's
				// systemParams must carry `metaPixelId` (set by the
				// MetaPixelSystemParamResolver when the operator schedules
				// against a linked pixel). Missing-id case logs warn + skips,
				// mirroring the GA4/GSC ingests.
				const metaParams = resolvedParams as unknown as PixelEventsStatsParams & {
					metaPixelId?: string;
				};
				if (!metaParams.metaPixelId) {
					runLog.warn({}, 'meta-pixel-events-stats job missing metaPixelId in systemParams; skipping ingest');
				} else {
					const fallbackDate =
						typeof metaParams.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(metaParams.endDate)
							? metaParams.endDate
							: dateBucket;
					const rows = extractPixelEventRows(fetchResult as PixelEventsStatsResponse, fallbackDate);
					await this.deps.ingestMetaPixelEventsUseCase.execute({
						metaPixelId: metaParams.metaPixelId,
						rawPayloadId,
						rows,
					});
				}
			}

			if (definition.providerId.value === 'meta' && definition.endpointId.value === 'meta-ads-insights') {
				// Issue #45 — Meta Ads Insights ingest. The job's systemParams
				// must carry `metaAdAccountId`, set by the
				// MetaAdAccountSystemParamResolver. The `level` param drives
				// the row granularity (campaign by default).
				const metaParams = resolvedParams as unknown as AdsInsightsParams & {
					metaAdAccountId?: string;
				};
				if (!metaParams.metaAdAccountId) {
					runLog.warn({}, 'meta-ads-insights job missing metaAdAccountId in systemParams; skipping ingest');
				} else {
					const fallbackDate =
						typeof metaParams.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(metaParams.endDate)
							? metaParams.endDate
							: dateBucket;
					const rows = extractAdsInsightRows(
						fetchResult as AdsInsightsResponse,
						metaParams.level ?? 'campaign',
						fallbackDate,
					);
					await this.deps.ingestMetaAdsInsightsUseCase.execute({
						metaAdAccountId: metaParams.metaAdAccountId,
						rawPayloadId,
						rows,
					});
				}
			}

			// `meta-custom-audiences` is intentionally a raw-payload-only
			// endpoint: we don't time-series the audience inventory because
			// Meta's `approximate_count_*` bands are too noisy. The raw
			// payload is persisted above; downstream consumers can read it
			// from raw_payloads until a dedicated read model lands.

			if (
				definition.providerId.value === 'openai' &&
				definition.endpointId.value === 'openai-responses-with-web-search'
			) {
				await this.ingestAiSearchAnswer(
					resolvedParams,
					rawPayloadId,
					normaliseOpenAiResponse(fetchResult as OpenAiResponsePayload),
					runLog,
					'openai-responses-with-web-search',
				);
			}

			if (
				definition.providerId.value === 'anthropic' &&
				definition.endpointId.value === 'anthropic-messages-with-web-search'
			) {
				await this.ingestAiSearchAnswer(
					resolvedParams,
					rawPayloadId,
					normaliseAnthropicResponse(fetchResult as AnthropicMessagesPayload),
					runLog,
					'anthropic-messages-with-web-search',
				);
			}

			if (
				definition.providerId.value === 'perplexity' &&
				definition.endpointId.value === 'perplexity-sonar-search'
			) {
				await this.ingestAiSearchAnswer(
					resolvedParams,
					rawPayloadId,
					normalisePerplexityResponse(fetchResult as PerplexityChatPayload),
					runLog,
					'perplexity-sonar-search',
				);
			}

			if (
				definition.providerId.value === 'google-ai-studio' &&
				definition.endpointId.value === 'google-ai-studio-gemini-grounded'
			) {
				await this.ingestAiSearchAnswer(
					resolvedParams,
					rawPayloadId,
					normaliseGeminiResponse(fetchResult as GeminiPayload),
					runLog,
					'google-ai-studio-gemini-grounded',
				);
			}

			run.complete(rawPayloadId, this.deps.clock.now());
			definition.markRan(this.deps.clock.now());
			await this.deps.jobDefRepo.save(definition);
			await this.deps.jobRunRepo.save(run);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);

			if (isQuotaExhaustedError(err)) {
				// Auto-pause the definition so the next cron tick is a no-op
				// (the `if (!definition.enabled) skip` branch above). The
				// operator must explicitly re-enable after topping up credit.
				definition.disable();
				await this.deps.jobDefRepo.save(definition);
				run.fail({ code: 'QUOTA_EXCEEDED', message, retryable: false }, this.deps.clock.now());
				await this.deps.jobRunRepo.save(run);
				runLog.warn(
					{},
					'provider returned quota-exhausted error — definition auto-paused, top up credit and re-enable from the UI',
				);
				return;
			}

			run.fail({ code: 'FETCH_FAILED', message, retryable: true }, this.deps.clock.now());
			await this.deps.jobRunRepo.save(run);
			throw err;
		}
	}

	/**
	 * Shared ingest path for the 4 AI Brand Radar endpoints. Each provider's
	 * ACL produces the same `NormalisedLlmAnswer` shape, so the routing here
	 * is identical — only the upstream parser differs (handled at the call
	 * site). systemParams must carry `brandPromptId`, `country`, `language`
	 * (set by AutoScheduleOnBrandPromptCreatedHandler when the user creates
	 * a BrandPrompt). The use case fans the captured raw response through
	 * the LLM-as-judge to extract mentions and citations, then persists the
	 * LlmAnswer row.
	 */
	private async ingestAiSearchAnswer(
		resolvedParams: Record<string, unknown>,
		rawPayloadId: string,
		normalised: {
			aiProvider: string;
			model: string;
			rawText: string;
			citationUrls: readonly string[];
			tokenUsage: ReturnType<typeof Object>;
			costCents: number;
		},
		runLog: Logger,
		endpointId: string,
	): Promise<void> {
		const aiParams = resolvedParams as {
			brandPromptId?: string;
			country?: string;
			language?: string;
		};
		if (!aiParams.brandPromptId || !aiParams.country || !aiParams.language) {
			runLog.warn(
				{ aiParams, endpointId },
				`${endpointId} job missing brandPromptId/country/language in systemParams; skipping ingest`,
			);
			return;
		}
		await this.deps.recordLlmAnswerUseCase.execute({
			brandPromptId: aiParams.brandPromptId,
			country: aiParams.country,
			language: aiParams.language,
			rawPayloadId,
			response: normalised as unknown as Parameters<
				typeof this.deps.recordLlmAnswerUseCase.execute
			>[0]['response'],
		});
	}
}
