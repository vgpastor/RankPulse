import { BingProvider } from '@rankpulse/provider-bing';
import { BrevoProvider } from '@rankpulse/provider-brevo';
import { CloudflareRadarProvider } from '@rankpulse/provider-cloudflare-radar';
import { ProviderRegistry } from '@rankpulse/provider-core';
import { DataForSeoProvider } from '@rankpulse/provider-dataforseo';
import { Ga4Provider } from '@rankpulse/provider-ga4';
import { GscProvider } from '@rankpulse/provider-gsc';
import { MetaProvider } from '@rankpulse/provider-meta';
import { ClarityProvider } from '@rankpulse/provider-microsoft-clarity';
import { OpenAiProvider } from '@rankpulse/provider-openai';
import { PageSpeedProvider } from '@rankpulse/provider-pagespeed';
import { WikipediaProvider } from '@rankpulse/provider-wikipedia';

/**
 * Composition root for provider plug-ins active in this deployment. Adding a
 * vendor is a single line here — the rest of the worker stays untouched.
 */
export function buildProviderRegistry(options: { dataforseoBaseUrl: string }): ProviderRegistry {
	const registry = new ProviderRegistry();
	registry.register(new DataForSeoProvider({ baseUrl: options.dataforseoBaseUrl }));
	registry.register(new Ga4Provider());
	registry.register(new GscProvider());
	registry.register(new WikipediaProvider());
	registry.register(new PageSpeedProvider());
	registry.register(new BingProvider());
	registry.register(new CloudflareRadarProvider());
	registry.register(new MetaProvider());
	registry.register(new ClarityProvider());
	registry.register(new BrevoProvider());
	registry.register(new OpenAiProvider());
	return registry;
}
