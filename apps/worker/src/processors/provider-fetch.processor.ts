import type {
	ProviderConnectivity as ProviderConnectivityUseCases,
	RankTracking as RankTrackingUseCases,
} from '@rankpulse/application';
import { ProviderConnectivity, type RankTracking as RankTrackingDomain } from '@rankpulse/domain';
import type { ProviderFetchJobData } from '@rankpulse/infrastructure/queue';
import type { ProviderRegistry } from '@rankpulse/provider-core';
import { type SerpLiveResponse, extractRankingForDomain } from '@rankpulse/provider-dataforseo';
import { type Clock, type IdGenerator, NotFoundError } from '@rankpulse/shared';
import type { Logger } from 'pino';

export interface ProviderFetchProcessorDeps {
	registry: ProviderRegistry;
	credentialRepo: ProviderConnectivity.CredentialRepository;
	jobDefRepo: ProviderConnectivity.JobDefinitionRepository;
	jobRunRepo: ProviderConnectivity.JobRunRepository;
	rawPayloadRepo: ProviderConnectivity.RawPayloadRepository;
	apiUsageRepo: ProviderConnectivity.ApiUsageRepository;
	trackedKeywordRepo: RankTrackingDomain.TrackedKeywordRepository;
	vault: ProviderConnectivity.CredentialVault;
	resolveCredentialUseCase: ProviderConnectivityUseCases.ResolveProviderCredentialUseCase;
	recordApiUsageUseCase: ProviderConnectivityUseCases.RecordApiUsageUseCase;
	recordRankingObservationUseCase: RankTrackingUseCases.RecordRankingObservationUseCase;
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
		const requestHash = ProviderConnectivity.computeRequestHashFor(
			definition.providerId,
			definition.endpointId,
			definition.params as Record<string, unknown>,
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
			const fetchResult = await provider.fetch(definition.endpointId.value, definition.params, {
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
				params: definition.params as Record<string, unknown>,
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

			run.complete(rawPayloadId, this.deps.clock.now());
			definition.markRan(this.deps.clock.now());
			await this.deps.jobDefRepo.save(definition);
			await this.deps.jobRunRepo.save(run);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			run.fail({ code: 'FETCH_FAILED', message, retryable: true }, this.deps.clock.now());
			await this.deps.jobRunRepo.save(run);
			throw err;
		}
	}
}
