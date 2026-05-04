import { NotFoundError } from '@rankpulse/shared';
import type { EndpointDescriptor, Provider } from './types.js';

/**
 * Lookup table over registered providers. Adding a provider is a one-liner
 * (`registry.register(provider)`) so the core has zero coupling to specific
 * vendors. The composition root in `apps/api` instantiates the registry with
 * the providers compiled into the deployment.
 */
export class ProviderRegistry {
	private readonly byId = new Map<string, Provider>();

	register(provider: Provider): void {
		const id = provider.id.value;
		if (this.byId.has(id)) {
			throw new Error(`Provider "${id}" is already registered`);
		}
		this.byId.set(id, provider);
	}

	has(providerId: string): boolean {
		return this.byId.has(providerId);
	}

	get(providerId: string): Provider {
		const provider = this.byId.get(providerId);
		if (!provider) {
			throw new NotFoundError(`Provider "${providerId}" is not registered`);
		}
		return provider;
	}

	list(): readonly Provider[] {
		return [...this.byId.values()];
	}

	endpoint(providerId: string, endpointId: string): EndpointDescriptor {
		const provider = this.get(providerId);
		const endpoint = provider.discover().find((e) => e.id === endpointId);
		if (!endpoint) {
			throw new NotFoundError(`Endpoint "${endpointId}" not found on provider "${providerId}"`);
		}
		return endpoint;
	}
}
