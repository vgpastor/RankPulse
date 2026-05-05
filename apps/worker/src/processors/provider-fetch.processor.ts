import type {
	ProviderConnectivity as ProviderConnectivityUseCases,
	RankTracking as RankTrackingUseCases,
	SearchConsoleInsights as SearchConsoleInsightsUseCases,
} from '@rankpulse/application';
import {
	ProviderConnectivity,
	type RankTracking as RankTrackingDomain,
	type SearchConsoleInsights as SearchConsoleInsightsDomain,
} from '@rankpulse/domain';
import type { ProviderFetchJobData } from '@rankpulse/infrastructure/queue';
import type { ProviderRegistry } from '@rankpulse/provider-core';
import {
	DataForSeoApiError,
	extractRankingForDomain,
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

/**
 * BACKLOG #14: detect provider-side "out of quota / payment required" so the
 * processor stops retrying AND the job definition is auto-paused — otherwise
 * BullMQ keeps hammering the upstream and the same error fills the run log.
 * 402 (Payment Required) is the universal "you ran out of credit" code; we
 * also accept 429 from quota-style providers (vs throttling 429s, which are
 * retryable — provider implementations can subclass to disambiguate later).
 */
const isQuotaExhaustedError = (err: unknown): boolean => {
	if (err instanceof DataForSeoApiError && err.status === 402) return true;
	if (err instanceof GscApiError && err.status === 402) return true;
	return false;
};

export interface ProviderFetchProcessorDeps {
	registry: ProviderRegistry;
	credentialRepo: ProviderConnectivity.CredentialRepository;
	jobDefRepo: ProviderConnectivity.JobDefinitionRepository;
	jobRunRepo: ProviderConnectivity.JobRunRepository;
	rawPayloadRepo: ProviderConnectivity.RawPayloadRepository;
	apiUsageRepo: ProviderConnectivity.ApiUsageRepository;
	trackedKeywordRepo: RankTrackingDomain.TrackedKeywordRepository;
	gscPropertyRepo: SearchConsoleInsightsDomain.GscPropertyRepository;
	vault: ProviderConnectivity.CredentialVault;
	resolveCredentialUseCase: ProviderConnectivityUseCases.ResolveProviderCredentialUseCase;
	recordApiUsageUseCase: ProviderConnectivityUseCases.RecordApiUsageUseCase;
	recordRankingObservationUseCase: RankTrackingUseCases.RecordRankingObservationUseCase;
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
		if (!definition.enabled) {
			this.deps.logger.info({ defId: definition.id }, 'job definition disabled, skipping');
			return;
		}

		const provider = this.deps.registry.get(definition.providerId.value);
		const endpointDescriptor = this.deps.registry.endpoint(
			definition.providerId.value,
			definition.endpointId.value,
		);
		const params = definition.params as {
			domain?: string;
			organizationId?: string;
			trackedKeywordId?: string;
		};

		const orgId = params.organizationId;
		if (!orgId) {
			throw new Error(`Job definition ${definition.id} missing organizationId param`);
		}

		const resolved = await this.deps.resolveCredentialUseCase.execute({
			organizationId: orgId,
			providerId: definition.providerId.value,
			hints: { domain: params.domain, projectId: definition.projectId },
			overrideCredentialId: definition.credentialOverrideId,
		});

		const runId = (data.runId ?? this.deps.ids.generate()) as ProviderConnectivity.ProviderJobRunId;
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
			this.deps.logger.info({ defId: definition.id, requestHash }, 'idempotent skip');
			run.complete(existing.id, this.deps.clock.now());
			await this.deps.jobRunRepo.save(run);
			return;
		}

		try {
			const fetchResult = await provider.fetch(definition.endpointId.value, resolvedParams, {
				credential: { plaintextSecret: resolved.plaintextSecret },
				logger: {
					debug: (msg, meta) => this.deps.logger.debug(meta ?? {}, msg),
					warn: (msg, meta) => this.deps.logger.warn(meta ?? {}, msg),
				},
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

			await this.deps.recordApiUsageUseCase.execute({
				organizationId: orgId,
				credentialId: resolved.credentialId,
				projectId: definition.projectId,
				providerId: definition.providerId.value,
				endpointId: definition.endpointId.value,
				calls: 1,
				costCents: endpointDescriptor.cost.amount,
			});

			if (
				definition.providerId.value === 'dataforseo' &&
				definition.endpointId.value === 'serp-google-organic-live' &&
				params.domain &&
				params.trackedKeywordId
			) {
				const extracted = extractRankingForDomain(fetchResult as SerpLiveResponse, params.domain);
				await this.deps.recordRankingObservationUseCase.execute({
					trackedKeywordId: params.trackedKeywordId,
					position: extracted.position,
					url: extracted.url,
					serpFeatures: extracted.serpFeatures,
					sourceProvider: definition.providerId.value,
					rawPayloadId,
				});
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
					this.deps.logger.warn(
						{ defId: definition.id },
						'gsc-search-analytics job missing gscPropertyId param; skipping ingest',
					);
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
				this.deps.logger.warn(
					{ defId: definition.id, providerId: definition.providerId.value },
					'provider returned 402 — definition auto-paused, top up credit and re-enable from the UI',
				);
				return;
			}

			run.fail({ code: 'FETCH_FAILED', message, retryable: true }, this.deps.clock.now());
			await this.deps.jobRunRepo.save(run);
			throw err;
		}
	}
}
