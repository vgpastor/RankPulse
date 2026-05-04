import { ProviderRegistry } from '@rankpulse/provider-core';
import { DataForSeoProvider } from '@rankpulse/provider-dataforseo';
import { GscProvider } from '@rankpulse/provider-gsc';

/**
 * Composition root for provider plug-ins active in this deployment. Adding a
 * vendor is a single line here — the rest of the worker stays untouched.
 */
export function buildProviderRegistry(options: { dataforseoBaseUrl: string }): ProviderRegistry {
	const registry = new ProviderRegistry();
	registry.register(new DataForSeoProvider({ baseUrl: options.dataforseoBaseUrl }));
	registry.register(new GscProvider());
	return registry;
}
