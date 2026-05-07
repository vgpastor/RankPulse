import { NotFoundError } from '@rankpulse/shared';
import type { HttpClient, ProviderManifest } from './manifest.js';
import type { EndpointDescriptor, FetchContext } from './types.js';

interface ManifestEntry {
	readonly manifest: ProviderManifest;
	readonly httpClient: HttpClient;
}

/**
 * Manifest-driven counterpart of the legacy `ProviderRegistry` (which
 * registered `Provider` class instances). Built once at composition time
 * from `ProviderManifest[]` — each manifest's `buildHttpClient(http)` is
 * called to instantiate the per-provider `BaseHttpClient` subclass that
 * `endpoint.fetch()` expects.
 *
 * Replaces the runtime side of the legacy `Provider` interface (Phase 6
 * of ADR 0002). Adding a vendor is one entry in the manifest array
 * passed to `buildManifestProviderRegistry`; the rest of the worker /
 * api layers stay decoupled.
 *
 * The registry is intentionally read-only after construction — manifests
 * are static deployment-time data, not runtime mutable state.
 */
export class ManifestProviderRegistry {
	constructor(private readonly entries: ReadonlyMap<string, ManifestEntry>) {}

	has(providerId: string): boolean {
		return this.entries.has(providerId);
	}

	get(providerId: string): ProviderManifest {
		const entry = this.entries.get(providerId);
		if (!entry) {
			throw new NotFoundError(`Provider "${providerId}" is not registered`);
		}
		return entry.manifest;
	}

	list(): readonly ProviderManifest[] {
		return [...this.entries.values()].map((e) => e.manifest);
	}

	endpoint(providerId: string, endpointId: string): EndpointDescriptor {
		const manifest = this.get(providerId);
		const ep = manifest.endpoints.find((e) => e.descriptor.id === endpointId);
		if (!ep) {
			throw new NotFoundError(`Endpoint "${endpointId}" not found on provider "${providerId}"`);
		}
		return ep.descriptor;
	}

	/**
	 * Validates the credential format using the manifest's per-provider
	 * `validateCredentialPlaintext` hook. Throws `InvalidInputError` on
	 * format mismatch — re-raised as-is so the caller surfaces a 400.
	 */
	validateCredential(providerId: string, plaintextSecret: string): void {
		const manifest = this.get(providerId);
		manifest.validateCredentialPlaintext(plaintextSecret);
	}

	/**
	 * Fetches the upstream payload for the given (providerId, endpointId)
	 * tuple. The returned value is the parsed JSON body — the IngestRouter
	 * then either dispatches it to the matching IngestUseCase or persists
	 * the raw payload for raw-only endpoints.
	 *
	 * Mirrors the legacy `Provider.fetch(endpointId, params, ctx)` shape so
	 * the worker processor can switch from one to the other with no caller
	 * changes.
	 */
	async fetch(providerId: string, endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		const entry = this.entries.get(providerId);
		if (!entry) throw new NotFoundError(`Provider "${providerId}" is not registered`);
		const ep = entry.manifest.endpoints.find((e) => e.descriptor.id === endpointId);
		if (!ep) {
			throw new NotFoundError(`Endpoint "${endpointId}" not found on provider "${providerId}"`);
		}
		return ep.fetch(entry.httpClient, params, ctx);
	}
}

/**
 * Builds a registry from the deployment's manifest array. Each manifest's
 * `buildHttpClient(http)` is invoked once here; the resulting client is
 * cached and reused across every endpoint fetch for that provider.
 */
export function buildManifestProviderRegistry(
	manifests: readonly ProviderManifest[],
): ManifestProviderRegistry {
	const entries = new Map<string, ManifestEntry>();
	for (const manifest of manifests) {
		if (entries.has(manifest.id)) {
			throw new Error(`Provider "${manifest.id}" is registered more than once`);
		}
		entries.set(manifest.id, {
			manifest,
			httpClient: manifest.buildHttpClient(manifest.http),
		});
	}
	return new ManifestProviderRegistry(entries);
}
