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
};
