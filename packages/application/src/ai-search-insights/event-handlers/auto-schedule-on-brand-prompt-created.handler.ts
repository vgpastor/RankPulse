import {
	type AiSearchInsights,
	type ProjectManagement,
	ProviderConnectivity,
	type SharedKernel,
} from '@rankpulse/domain';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

export interface EventHandlerLogger {
	info(meta: object, msg: string): void;
	error(meta: object, msg: string): void;
}

const NOOP_LOGGER: EventHandlerLogger = {
	info: () => {},
	error: () => {},
};

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
 * Sub-issues #61 + #62 — auto-schedule the LLM-search fetches when a
 * BrandPrompt is created. Fans out to every connected AI provider × every
 * project locale.
 *
 * Behaviour:
 *  - Loads the project to know its `LocationLanguage[]`. No locations →
 *    skip with a log (the user must add at least one country/language to
 *    the project first).
 *  - For each provider in `AI_SEARCH_PROVIDER_DEFINITIONS` whose
 *    credential exists in the org, schedule one JobDefinition per locale.
 *    Providers without a credential are skipped silently (logged).
 *  - All scheduling calls are issued concurrently. The downstream
 *    `ScheduleEndpointFetchUseCase` deduplicates on
 *    `(projectId, providerId, endpointId, paramsHash)`, so re-publishes
 *    of `BrandPromptCreated` are idempotent.
 */
export class AutoScheduleOnBrandPromptCreatedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly credentials: ProviderConnectivity.CredentialRepository,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
		private readonly providerDefinitions: readonly AiProviderScheduleDefinition[] = AI_SEARCH_PROVIDER_DEFINITIONS,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'BrandPromptCreated') return;
		const promptEvent = event as AiSearchInsights.BrandPromptCreated;
		const { brandPromptId, projectId } = promptEvent;

		try {
			const project = await this.projects.findById(projectId);
			if (!project) {
				this.logger.error({ projectId }, 'project not found when auto-scheduling brand prompt');
				return;
			}
			if (project.locations.length === 0) {
				this.logger.info(
					{ brandPromptId, projectId },
					'project has no locations — skipping auto-schedule until one is added',
				);
				return;
			}

			// Provider credentials are looked up concurrently; each entry then
			// expands into N locale-scheduled JobDefinitions, all issued in
			// parallel. Failures on one provider/locale combo are logged but
			// don't abort siblings.
			await Promise.all(
				this.providerDefinitions.map((def) => this.scheduleProvider(def, promptEvent, project)),
			);
		} catch (err) {
			this.logger.error(
				{ brandPromptId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on BrandPromptCreated — operator must schedule manually',
			);
		}
	}

	private async scheduleProvider(
		def: AiProviderScheduleDefinition,
		event: AiSearchInsights.BrandPromptCreated,
		project: ProjectManagement.Project,
	): Promise<void> {
		const { brandPromptId, projectId, organizationId, text } = event;
		try {
			const creds = await this.credentials.listForProvider(
				organizationId,
				ProviderConnectivity.ProviderId.create(def.providerId),
			);
			if (creds.length === 0) {
				this.logger.info(
					{ brandPromptId, projectId, providerId: def.providerId },
					'no credential found for AI provider — skipping until connected',
				);
				return;
			}

			await Promise.all(
				project.locations.map(async (location) => {
					try {
						const result = await this.scheduleEndpointFetch.execute({
							projectId,
							providerId: def.providerId,
							endpointId: def.endpointId,
							params: {
								prompt: text,
								locationCountry: location.country,
								locationLanguage: location.language,
								model: def.model,
								brandPromptId,
							},
							systemParams: {
								organizationId,
								brandPromptId,
								country: location.country,
								language: location.language,
							},
							cron: def.cron,
							credentialOverrideId: null,
						});
						this.logger.info(
							{
								brandPromptId,
								providerId: def.providerId,
								definitionId: result.definitionId,
								locale: location.toString(),
							},
							'auto-scheduled AI provider fetch for brand prompt',
						);
					} catch (innerErr) {
						this.logger.error(
							{
								brandPromptId,
								providerId: def.providerId,
								locale: location.toString(),
								err: innerErr instanceof Error ? innerErr.message : String(innerErr),
							},
							'auto-schedule failed for one provider/locale; continuing others',
						);
					}
				}),
			);
		} catch (outerErr) {
			this.logger.error(
				{
					brandPromptId,
					providerId: def.providerId,
					err: outerErr instanceof Error ? outerErr.message : String(outerErr),
				},
				'auto-schedule failed for AI provider; continuing others',
			);
		}
	}
}
