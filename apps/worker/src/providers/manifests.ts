import { anthropicProviderManifest } from '@rankpulse/provider-anthropic';
import { bingProviderManifest } from '@rankpulse/provider-bing';
import { brevoProviderManifest } from '@rankpulse/provider-brevo';
import { cloudflareRadarProviderManifest } from '@rankpulse/provider-cloudflare-radar';
import type { ProviderManifest } from '@rankpulse/provider-core';
import { dataforseoProviderManifest } from '@rankpulse/provider-dataforseo';
import { ga4ProviderManifest } from '@rankpulse/provider-ga4';
import { googleAiStudioProviderManifest } from '@rankpulse/provider-google-ai-studio';
import { googleSearchConsoleProviderManifest } from '@rankpulse/provider-gsc';
import { metaProviderManifest } from '@rankpulse/provider-meta';
import { microsoftClarityProviderManifest } from '@rankpulse/provider-microsoft-clarity';
import { openaiProviderManifest } from '@rankpulse/provider-openai';
import { pagespeedProviderManifest } from '@rankpulse/provider-pagespeed';
import { perplexityProviderManifest } from '@rankpulse/provider-perplexity';
import { waybackProviderManifest } from '@rankpulse/provider-wayback';
import { wikipediaProviderManifest } from '@rankpulse/provider-wikipedia';

/**
 * Aggregated `ProviderManifest` array for every vendor active in this
 * deployment. The IngestRouter and the manifest-driven
 * `ManifestProviderRegistry` are both built from this list at
 * composition time (see `apps/worker/src/main.ts`); adding a vendor is
 * a single line here — the rest of the worker stays untouched.
 *
 * Replaces `apps/worker/src/providers/registry.ts` (legacy `Provider`
 * interface, deleted in Phase 7b of ADR 0002).
 */
export const ALL_PROVIDER_MANIFESTS: readonly ProviderManifest[] = [
	dataforseoProviderManifest,
	ga4ProviderManifest,
	googleSearchConsoleProviderManifest,
	wikipediaProviderManifest,
	pagespeedProviderManifest,
	bingProviderManifest,
	cloudflareRadarProviderManifest,
	metaProviderManifest,
	microsoftClarityProviderManifest,
	brevoProviderManifest,
	openaiProviderManifest,
	anthropicProviderManifest,
	perplexityProviderManifest,
	googleAiStudioProviderManifest,
	waybackProviderManifest,
];
