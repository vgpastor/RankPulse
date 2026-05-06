/**
 * Entity-bound endpoints — the seven endpoints whose JobDefinition is auto-
 * created by their bounded context's link/add handler when the underlying
 * entity is registered. The manual schedule route on the API
 * (`POST /providers/:p/endpoints/:e/schedule`) returns 400 for these, so
 * the UI must hide them from the manual schedule flow.
 *
 * See ADR 0001 (`docs/adr/0001-eliminate-systemparamresolver-via-auto-schedule-handlers.md`).
 *
 * Keep this list in sync with `ENTITY_BOUND_ENDPOINTS` in
 * `apps/api/src/modules/provider-connectivity/providers.controller.ts`.
 */
export const ENTITY_BOUND_ENDPOINT_IDS = new Set<string>([
	'gsc-search-analytics',
	'ga4-run-report',
	'wikipedia-pageviews-per-article',
	'bing-rank-and-traffic-stats',
	'clarity-data-export',
	'psi-runpagespeed',
	'radar-domain-rank',
	// AI Brand Radar — fanned out by AutoScheduleOnBrandPromptCreatedHandler.
	'openai-responses-with-web-search',
	'anthropic-messages-with-web-search',
	'perplexity-sonar-search',
	'google-ai-studio-gemini-grounded',
	// Meta — auto-scheduled by the meta-ads-attribution handlers when the
	// pixel / ad-account is linked.
	'meta-pixel-events-stats',
	'meta-ads-insights',
	'meta-custom-audiences',
]);

/**
 * Human-friendly hint pointing the operator at the right entity-link UI
 * when they land on (or filter to) an entity-bound endpoint.
 */
export const ENTITY_LINK_ROUTE_HINT: Record<string, string> = {
	'gsc-search-analytics': 'Link a GSC property in Settings → Providers → Google Search Console.',
	'ga4-run-report': 'Link a GA4 property in Settings → Providers → Google Analytics 4.',
	'wikipedia-pageviews-per-article': 'Link a Wikipedia article in Settings → Providers → Wikipedia.',
	'bing-rank-and-traffic-stats': 'Link a Bing property in Settings → Providers → Bing Webmaster Tools.',
	'clarity-data-export': 'Link a Clarity project in Settings → Providers → Microsoft Clarity.',
	'psi-runpagespeed': 'Track a page in Settings → Web Performance.',
	'radar-domain-rank': 'Add a monitored domain in Settings → Macro Context.',
	'openai-responses-with-web-search': 'Register a brand prompt in Settings → AI Brand Radar.',
	'anthropic-messages-with-web-search': 'Register a brand prompt in Settings → AI Brand Radar.',
	'perplexity-sonar-search': 'Register a brand prompt in Settings → AI Brand Radar.',
	'google-ai-studio-gemini-grounded': 'Register a brand prompt in Settings → AI Brand Radar.',
	'meta-pixel-events-stats': 'Link a Meta pixel in Settings → Providers → Meta.',
	'meta-ads-insights': 'Link a Meta ad account in Settings → Providers → Meta.',
	'meta-custom-audiences': 'Link a Meta ad account in Settings → Providers → Meta.',
};
