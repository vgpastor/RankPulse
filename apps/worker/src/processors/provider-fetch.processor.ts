import type {
	ProjectManagement as ProjectManagementUseCases,
	ProviderConnectivity as ProviderConnectivityUseCases,
	RankTracking as RankTrackingUseCases,
	SearchConsoleInsights as SearchConsoleInsightsUseCases,
} from '@rankpulse/application';
import {
	type ProjectManagement,
	ProviderConnectivity,
	type RankTracking as RankTrackingDomain,
	type SearchConsoleInsights as SearchConsoleInsightsDomain,
} from '@rankpulse/domain';
import type { ProviderFetchJobData } from '@rankpulse/infrastructure/queue';
import type { ProviderRegistry } from '@rankpulse/provider-core';
import {
	DataForSeoApiError,
	extractTop10Domains,
	type SerpLiveResponse,
} from '@rankpulse/provider-dataforseo';
import {
	extractGscRows,
	GscApiError,
	type SearchAnalyticsParams,
	type SearchAnalyticsResponse,
} from '@rankpulse/provider-gsc';
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
	vault: ProviderConnectivity.CredentialVault;
	resolveCredentialUseCase: ProviderConnectivityUseCases.ResolveProviderCredentialUseCase;
	recordApiUsageUseCase: ProviderConnectivityUseCases.RecordApiUsageUseCase;
	recordRankingObservationUseCase: RankTrackingUseCases.RecordRankingObservationUseCase;
	recordTop10HitsForSuggestionsUseCase: ProjectManagementUseCases.RecordTop10HitsForSuggestionsUseCase;
	ingestGscRowsUseCase: SearchConsoleInsightsUseCases.IngestGscRowsUseCase;
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
}
