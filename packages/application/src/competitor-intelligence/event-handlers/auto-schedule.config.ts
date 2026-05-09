import { type ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import type { AutoScheduleConfig, AutoScheduleSpec } from '../../_core/auto-schedule.js';
import type { SharedDeps } from '../../_core/module.js';

/**
 * DataForSEO `location_code` numeric IDs keyed by ISO 3166-1 alpha-2
 * country code. Only the markets PatrolTech (and other early adopters)
 * actually serve are mapped — adding a new country is one entry here.
 *
 * Source: https://docs.dataforseo.com/v3/serp/google/locations/
 *
 * If a project's location uses an un-mapped country, the auto-schedule
 * handler logs and skips that location (the operator can still add the
 * schedule manually via POST /endpoints/.../schedule). We deliberately
 * do NOT throw — a single un-mapped country shouldn't block the rest
 * of a multi-locale project.
 */
export const DATAFORSEO_LOCATION_CODES: Readonly<Record<string, number>> = {
	ES: 2724, // Spain
	US: 2840, // United States
	GB: 2826, // United Kingdom
	FR: 2250, // France
	MX: 2484, // Mexico
	DE: 2276,
	IT: 2380,
	PT: 2620,
	BR: 2076,
	AR: 2032,
	CL: 2152,
	CO: 2170,
	CA: 2124,
};

/**
 * Convert a project `LocationLanguage`'s language tag (e.g. `'en-US'`,
 * `'es-ES'`) to the 2-letter form DataForSEO Labs expects on
 * ranked-keywords / domain-intersection / page-intersection /
 * historical-serps (`'en'`, `'es'`).
 *
 * SERP-Live and other endpoints use the full IETF tag — those have
 * their own auto-schedule wiring outside competitor-intelligence and
 * are unaffected.
 */
const toLabsLanguageCode = (language: string): string => {
	const head = language.split('-')[0]?.toLowerCase();
	return head ?? language.toLowerCase();
};

interface CompetitorIntelligenceAutoScheduleDeps extends SharedDeps {
	readonly projectRepo: ProjectManagement.ProjectRepository;
}

/**
 * Default scheduling parameters for the auto-created DataForSEO labs
 * jobs. Cron times are spread across Monday morning so the per-provider
 * rate limit (PR #124) doesn't reject runs that all fire at the same
 * second.
 */
const RANKED_KEYWORDS_DEFAULTS = {
	providerId: 'dataforseo',
	endpointId: 'dataforseo-labs-ranked-keywords',
	cron: '0 7 * * 1', // Mondays 07:00 UTC
	limit: 1_000,
};

const DOMAIN_INTERSECTION_DEFAULTS = {
	providerId: 'dataforseo',
	endpointId: 'dataforseo-labs-domain-intersection',
	cron: '5 7 * * 1', // Mondays 07:05 UTC (5 min offset to spread load)
	limit: 1_000,
};

/**
 * Build the spec list for the `CompetitorAdded` event:
 *   • 1× ranked-keywords for the competitor (target = competitor.domain)
 *   • 1× domain-intersection per project location (targets = [primary, competitor])
 *
 * The fan-out is per location, NOT per (location × our domain) — we use
 * `project.primaryDomain` only. Domain-intersection on every alias domain
 * would 4-5x the schedule count without proportional value (the alias
 * domains ranking poorly is exactly what they're for). Adding alias
 * coverage later is a follow-up.
 *
 * Idempotency key: `competitorDomain` for ranked-keywords (one schedule
 * per competitor regardless of location duplication), and a composite
 * `competitorDomain|country|language` for domain-intersection so multi-
 * locale projects (PT EN: US + GB) get one schedule per locale.
 */
const buildCompetitorAddedSpecs = async (
	event: SharedKernel.DomainEvent,
	deps: SharedDeps,
): Promise<readonly AutoScheduleSpec[]> => {
	if (event.type !== 'project-management.CompetitorAdded') return [];
	const ciDeps = deps as CompetitorIntelligenceAutoScheduleDeps;
	const e = event as ProjectManagement.CompetitorAdded;

	const project = await ciDeps.projectRepo.findById(e.projectId);
	if (!project) return [];
	if (project.locations.length === 0) return [];

	const ourDomain = project.primaryDomain.value;
	const competitorDomain = e.domain;
	const specs: AutoScheduleSpec[] = [];

	for (const location of project.locations) {
		const locationCode = DATAFORSEO_LOCATION_CODES[location.country.toUpperCase()];
		if (locationCode === undefined) continue; // un-mapped country, see note above
		const languageCode = toLabsLanguageCode(location.language);

		// 1. ranked-keywords for the competitor — one per locale because
		// search volume + position differ per market.
		specs.push({
			providerId: RANKED_KEYWORDS_DEFAULTS.providerId,
			endpointId: RANKED_KEYWORDS_DEFAULTS.endpointId,
			cron: RANKED_KEYWORDS_DEFAULTS.cron,
			systemParamKey: 'targetDomain',
			paramsBuilder: () => ({
				target: competitorDomain,
				locationCode,
				languageCode,
				limit: RANKED_KEYWORDS_DEFAULTS.limit,
			}),
			systemParamsBuilder: () => ({
				targetDomain: competitorDomain,
				country: location.country,
				language: languageCode,
			}),
		});

		// 2. domain-intersection — pairs OUR primary domain × this competitor.
		specs.push({
			providerId: DOMAIN_INTERSECTION_DEFAULTS.providerId,
			endpointId: DOMAIN_INTERSECTION_DEFAULTS.endpointId,
			cron: DOMAIN_INTERSECTION_DEFAULTS.cron,
			// Composite idempotency key so two specs (different locales)
			// for the same (ourDomain, competitorDomain) don't collide and
			// the second one isn't dropped. ScheduleEndpointFetchUseCase
			// looks up `params[systemParamKey]` via a string `equals` match.
			systemParamKey: 'intersectionScheduleKey',
			paramsBuilder: () => ({
				targets: [ourDomain, competitorDomain],
				locationCode,
				languageCode,
				limit: DOMAIN_INTERSECTION_DEFAULTS.limit,
			}),
			systemParamsBuilder: () => ({
				ourDomain,
				competitorDomain,
				country: location.country,
				language: languageCode,
				intersectionScheduleKey: `${ourDomain}|${competitorDomain}|${location.country}|${languageCode}`,
			}),
		});
	}

	return specs;
};

/**
 * Build the spec list for the `DomainAdded` event: schedule a
 * ranked-keywords fetch with target = the new domain. Same per-locale
 * fan-out as competitors so a multi-market project (PT EN US + GB)
 * tracks our own domain in both markets.
 *
 * Note: the `kind` field on the event (`'main' | 'subdomain' | 'alias'`)
 * is intentionally ignored — for ranked-keywords purposes a domain is a
 * domain. If product later wants to scope only `'main'` here, it's a
 * one-line filter.
 */
const buildDomainAddedSpecs = async (
	event: SharedKernel.DomainEvent,
	deps: SharedDeps,
): Promise<readonly AutoScheduleSpec[]> => {
	if (event.type !== 'project-management.DomainAdded') return [];
	const ciDeps = deps as CompetitorIntelligenceAutoScheduleDeps;
	const e = event as ProjectManagement.DomainAdded;

	const project = await ciDeps.projectRepo.findById(e.projectId);
	if (!project) return [];
	if (project.locations.length === 0) return [];

	const ourDomain = e.domain;
	const specs: AutoScheduleSpec[] = [];

	for (const location of project.locations) {
		const locationCode = DATAFORSEO_LOCATION_CODES[location.country.toUpperCase()];
		if (locationCode === undefined) continue;
		const languageCode = toLabsLanguageCode(location.language);

		specs.push({
			providerId: RANKED_KEYWORDS_DEFAULTS.providerId,
			endpointId: RANKED_KEYWORDS_DEFAULTS.endpointId,
			cron: RANKED_KEYWORDS_DEFAULTS.cron,
			systemParamKey: 'targetDomain',
			paramsBuilder: () => ({
				target: ourDomain,
				locationCode,
				languageCode,
				limit: RANKED_KEYWORDS_DEFAULTS.limit,
			}),
			systemParamsBuilder: () => ({
				targetDomain: ourDomain,
				country: location.country,
				language: languageCode,
			}),
		});
	}

	return specs;
};

/**
 * Auto-schedule configs owned by competitor-intelligence. Closes the
 * "auto-schedule wiring is a follow-up" TODOs left by #134, #136, #137
 * (issue #142).
 *
 * Two events drive scheduling:
 *  - `project-management.CompetitorAdded` (emitted by AddCompetitorUseCase)
 *  - `project-management.DomainAdded` (emitted by Project.addDomain)
 *
 * The third bullet on issue #142 — top-N URL reconciliation for
 * on-page-instant audits — is a recurring read job, not an event
 * reaction. It belongs in a separate scheduled use case and is
 * intentionally NOT part of this PR.
 */
export const competitorIntelligenceAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'project-management.CompetitorAdded',
		dynamicSchedules: buildCompetitorAddedSpecs,
	},
	{
		event: 'project-management.DomainAdded',
		dynamicSchedules: buildDomainAddedSpecs,
	},
];
