import type { Core as ApplicationCore } from '@rankpulse/application';
import type { ProviderConnectivity } from '@rankpulse/domain';
import type { AclContext, ProviderManifest } from '@rankpulse/provider-core';
import { NotFoundError } from '@rankpulse/shared';

type IngestUseCase = ApplicationCore.IngestUseCase;
type ProviderEndpointKey = `${string}|${string}`;

export interface IngestRouterEntry {
	readonly systemParamKey: string;
	readonly acl: (response: unknown, ctx: AclContext) => unknown[];
	readonly ingest: IngestUseCase;
}

export interface IngestRouterDispatchInput {
	readonly providerId: string;
	readonly endpointId: string;
	readonly fetchResult: unknown;
	readonly rawPayloadId: string;
	readonly definition: ProviderConnectivity.ProviderJobDefinition;
	readonly dateBucket: string;
}

/**
 * Routes provider fetch results to the correct ingest use case based on
 * the (providerId, endpointId) tuple. Replaces the 12 if-else dispatch
 * blocks in the old provider-fetch.processor.ts.
 *
 * Built once at composition time from `ProviderManifest.endpoints[].ingest`
 * + the merged `ContextRegistrations.ingestUseCases` map. Endpoints with
 * `ingest: null` are raw-only — `dispatch()` returns false for those;
 * the caller has already persisted the raw payload.
 *
 * `dispatch()` returns true when an ingest entry was found AND executed
 * for the (providerId, endpointId) tuple, false when no entry exists. The
 * processor uses this to fall back to legacy if-else dispatch for endpoints
 * the router doesn't yet cover (DataForSEO ranking-observation fan-out).
 */
export class IngestRouter {
	constructor(private readonly entries: ReadonlyMap<ProviderEndpointKey, IngestRouterEntry>) {}

	has(providerId: string, endpointId: string): boolean {
		return this.entries.has(`${providerId}|${endpointId}`);
	}

	async dispatch(input: IngestRouterDispatchInput): Promise<boolean> {
		const key: ProviderEndpointKey = `${input.providerId}|${input.endpointId}`;
		const entry = this.entries.get(key);
		if (!entry) return false;

		const params = input.definition.params as Record<string, unknown>;
		const systemParamValue = params[entry.systemParamKey];
		if (!systemParamValue) {
			throw new NotFoundError(
				`${input.providerId}/${input.endpointId} processor reached without ${entry.systemParamKey} in systemParams. ` +
					`Auto-Schedule handler should have set this. See ADR 0001.`,
			);
		}

		const rows = entry.acl(input.fetchResult, {
			dateBucket: input.dateBucket,
			systemParams: params,
			endpointParams: params,
		});

		await entry.ingest.execute({
			rawPayloadId: input.rawPayloadId,
			rows,
			systemParams: params,
		});
		return true;
	}
}

export function buildIngestRouter(
	manifests: readonly ProviderManifest[],
	ingestUseCases: Record<string, IngestUseCase>,
): IngestRouter {
	const entries = new Map<ProviderEndpointKey, IngestRouterEntry>();
	for (const manifest of manifests) {
		for (const endpoint of manifest.endpoints) {
			if (!endpoint.ingest) continue;
			const useCase = ingestUseCases[endpoint.ingest.useCaseKey];
			if (!useCase) {
				throw new Error(
					`IngestRouter: no IngestUseCase registered for key '${endpoint.ingest.useCaseKey}' (provider ${manifest.id}, endpoint ${endpoint.descriptor.id})`,
				);
			}
			const key: ProviderEndpointKey = `${manifest.id}|${endpoint.descriptor.id}`;
			entries.set(key, {
				systemParamKey: endpoint.ingest.systemParamKey,
				acl: endpoint.ingest.acl as (response: unknown, ctx: AclContext) => unknown[],
				ingest: useCase,
			});
		}
	}
	return new IngestRouter(entries);
}
