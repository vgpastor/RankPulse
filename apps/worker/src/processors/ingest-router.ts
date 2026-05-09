import type { Core as ApplicationCore } from '@rankpulse/application';
import type { ProviderConnectivity } from '@rankpulse/domain';
import type { AclContext, ProviderManifest } from '@rankpulse/provider-core';
import { NotFoundError } from '@rankpulse/shared';

type IngestUseCase = ApplicationCore.IngestUseCase;
type ProviderEndpointKey = `${string}|${string}`;

export interface IngestRouterEntry {
	readonly systemParamKey: string;
	/**
	 * Extra systemParams the ACL/handler reads beyond `systemParamKey`.
	 * Validated together with the primary key so a single dispatch
	 * surfaces ALL missing keys in one error (#150).
	 */
	readonly additionalSystemParamKeys?: readonly string[];
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
		// #150 — validate the primary `systemParamKey` AND any
		// `additionalSystemParamKeys` declared on the binding in one pass,
		// then surface ALL missing keys in a single error. Pre-#150 the
		// router checked only the primary; the ACL then re-threw on its
		// extras one at a time, costing the operator a fresh `run-now`
		// per missing key (e.g. domain-intersection: ourDomain → fix → re-run
		// → competitorDomain → fix → re-run).
		const requiredKeys = entry.additionalSystemParamKeys
			? [entry.systemParamKey, ...entry.additionalSystemParamKeys]
			: [entry.systemParamKey];
		const missingKeys = requiredKeys.filter((k) => {
			const v = params[k];
			// Treat empty string the same as missing — DataForSEO Labs ACLs
			// already reject `''` and `'   '`, so accepting them here would
			// just defer the failure to the ACL with a less helpful message.
			return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
		});
		if (missingKeys.length > 0) {
			const list = missingKeys.join(', ');
			const subject = missingKeys.length === 1 ? 'this' : 'these';
			throw new NotFoundError(
				`${input.providerId}/${input.endpointId} processor reached without systemParams: ${list}. ` +
					`Auto-Schedule handler should have set ${subject}. See ADR 0001.`,
			);
		}

		// Defence-in-depth for #147: even if the schedule path forgot to stamp
		// `projectId` (legacy defs created before the schedule use case fix),
		// inject it here from the entity column. Worker ingest handlers like
		// `rank-tracking:ingest-ranked-keywords` short-circuit silently when
		// `systemParams.projectId` is missing, so the row would be lost.
		const systemParamsWithEntityScope: Record<string, unknown> = {
			...params,
			projectId: (params.projectId as string | undefined) ?? input.definition.projectId,
		};

		const rows = entry.acl(input.fetchResult, {
			dateBucket: input.dateBucket,
			systemParams: systemParamsWithEntityScope,
			endpointParams: params,
		});

		await entry.ingest.execute({
			rawPayloadId: input.rawPayloadId,
			rows,
			systemParams: systemParamsWithEntityScope,
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
				additionalSystemParamKeys: endpoint.ingest.additionalSystemParamKeys,
				acl: endpoint.ingest.acl as (response: unknown, ctx: AclContext) => unknown[],
				ingest: useCase,
			});
		}
	}
	return new IngestRouter(entries);
}
