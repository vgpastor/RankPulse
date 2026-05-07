import { type AiSearchInsights, ProviderConnectivity, type SharedKernel } from '@rankpulse/domain';
import type { AutoScheduleConfig, AutoScheduleSpec } from '../../_core/auto-schedule.js';
import type { SharedDeps } from '../../_core/module.js';

interface AiProviderScheduleDefinition {
	readonly providerId: string;
	readonly endpointId: string;
	readonly model: string;
	readonly cron: string;
}

/**
 * The four AI-search providers RankPulse fans out to. Each entry maps a
 * `provider-connectivity` provider id (used to look up credentials) to the
 * descriptor id the worker dispatches against.
 *
 * Adding a fifth provider is one entry here + one descriptor in the
 * provider package + one dispatch branch in the worker processor — the
 * domain layer stays untouched.
 */
export const AI_SEARCH_PROVIDER_DEFINITIONS: readonly AiProviderScheduleDefinition[] = [
	{
		providerId: 'openai',
		endpointId: 'openai-responses-with-web-search',
		model: 'gpt-5-mini',
		cron: '0 7 * * *',
	},
	{
		providerId: 'anthropic',
		endpointId: 'anthropic-messages-with-web-search',
		model: 'claude-sonnet-4-6',
		cron: '0 7 * * *',
	},
	{
		providerId: 'perplexity',
		endpointId: 'perplexity-sonar-search',
		model: 'sonar',
		cron: '0 7 * * *',
	},
	{
		providerId: 'google-ai-studio',
		endpointId: 'google-ai-studio-gemini-grounded',
		model: 'gemini-2.5-flash',
		cron: '0 7 * * *',
	},
];

/**
 * Backwards-compat alias used by the OpenAI sub-issue (#61) tests. Equivalent
 * to the first entry of `AI_SEARCH_PROVIDER_DEFINITIONS`. Kept exported until
 * downstream callers migrate.
 */
const [OPENAI_DEFAULTS] = AI_SEARCH_PROVIDER_DEFINITIONS;
if (!OPENAI_DEFAULTS) {
	throw new Error('AI_SEARCH_PROVIDER_DEFINITIONS must contain at least one entry');
}
export const OPENAI_AUTO_SCHEDULE_DEFAULTS = OPENAI_DEFAULTS;

/**
 * SharedDeps shape required by the AI-search dynamicSchedules callback.
 * The composition root supplies these via `SharedDeps` cast — they're
 * the project repo (to read locations) and the credential repo (to skip
 * providers without a connected credential).
 */
interface AiSearchAutoScheduleDeps extends SharedDeps {
	readonly projects: {
		findById(
			id: string,
		): Promise<{ locations: readonly { country: string; language: string; toString(): string }[] } | null>;
	};
	readonly credentials: {
		listForProvider(orgId: string, providerId: ProviderConnectivity.ProviderId): Promise<readonly unknown[]>;
	};
}

/**
 * Auto-schedule configs owned by the ai-search-insights context (replaces
 * the standalone `AutoScheduleOnBrandPromptCreatedHandler` class — ADR
 * 0002 Phase 4a).
 *
 * Sub-issues #61 + #62 — fan out the LLM-search fetches when a BrandPrompt
 * is created. The schedule list is computed dynamically from the event +
 * project locations + connected credentials:
 *
 *  - Skip if the project has no locations (the user must add one first).
 *  - For each provider in `AI_SEARCH_PROVIDER_DEFINITIONS`, skip if no
 *    credential is connected for the org.
 *  - Otherwise emit one spec per (provider × locale) combo.
 *
 * Idempotency key is `brandPromptId` (same value across all specs); the
 * downstream `ScheduleEndpointFetchUseCase` de-duplicates on
 * `(projectId, providerId, endpointId, paramsHash)` so different locales
 * + providers don't collide despite sharing the key.
 */
export const aiSearchInsightsAutoScheduleConfigs: readonly AutoScheduleConfig[] = [
	{
		event: 'BrandPromptCreated',
		dynamicSchedules: async (event: SharedKernel.DomainEvent, deps: SharedDeps) => {
			const promptEvent = event as AiSearchInsights.BrandPromptCreated;
			const { brandPromptId, projectId, organizationId, text } = promptEvent;
			const aiDeps = deps as AiSearchAutoScheduleDeps;

			const project = await aiDeps.projects.findById(projectId);
			if (!project) return [];
			if (project.locations.length === 0) return [];

			// For each provider × locale combo, emit one schedule spec. We do
			// the credential-listForProvider concurrency here (cheaper than in
			// a per-spec callback) and filter the spec list before returning.
			const specsPerProvider = await Promise.all(
				AI_SEARCH_PROVIDER_DEFINITIONS.map(async (def): Promise<readonly AutoScheduleSpec[]> => {
					const creds = await aiDeps.credentials.listForProvider(
						organizationId,
						ProviderConnectivity.ProviderId.create(def.providerId),
					);
					if (creds.length === 0) return [];

					return project.locations.map((location) => ({
						providerId: def.providerId,
						endpointId: def.endpointId,
						cron: def.cron,
						systemParamKey: 'brandPromptId',
						paramsBuilder: () => ({
							prompt: text,
							locationCountry: location.country,
							locationLanguage: location.language,
							model: def.model,
							brandPromptId,
						}),
						systemParamsBuilder: () => ({
							organizationId,
							brandPromptId,
							country: location.country,
							language: location.language,
						}),
					}));
				}),
			);

			return specsPerProvider.flat();
		},
	},
];
