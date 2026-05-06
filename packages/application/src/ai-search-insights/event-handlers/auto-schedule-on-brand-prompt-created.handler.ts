import type {
	AiSearchInsights,
	ProjectManagement,
	ProviderConnectivity,
	SharedKernel,
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

/**
 * Defaults for the auto-created OpenAI Responses API JobDefinition.
 *
 * Kept here (not in the provider package) because it's an orchestration
 * decision: the AutoSchedule handler in the application layer decides how
 * BrandPrompts fan out across providers. The provider package only declares
 * the descriptor; the handler picks which descriptor to schedule against.
 */
export const OPENAI_AUTO_SCHEDULE_DEFAULTS = {
	providerId: 'openai',
	endpointId: 'openai-responses-with-web-search',
	cron: '0 7 * * *',
	model: 'gpt-5-mini',
};

/**
 * Sub-issue #61 of #27 — auto-schedule the OpenAI Responses fetch when a
 * BrandPrompt is created.
 *
 * Fan-out logic:
 *  - Reads the project to get its `LocationLanguage[]` set.
 *  - Reads `CredentialRepository.listForProvider(org, 'openai')` to confirm
 *    the org has at least one OpenAI credential. Without one, we skip
 *    silently (logging) and the user gets prompted to connect OpenAI in
 *    the UI before any captures will happen.
 *  - For each LocationLanguage, calls `ScheduleEndpointFetchUseCase` once.
 *
 * If the project has no locations yet, the handler ALSO skips with a log;
 * the project-management UI normally enforces ≥1 location before letting
 * the user reach the AI Brand Radar page, so this branch is defensive.
 *
 * Sub-issue #62 (multi-provider) extends this loop with Anthropic /
 * Perplexity / Gemini once their providers exist.
 */
export class AutoScheduleOnBrandPromptCreatedHandler {
	constructor(
		private readonly scheduleEndpointFetch: ScheduleEndpointFetchUseCase,
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly credentials: ProviderConnectivity.CredentialRepository,
		private readonly logger: EventHandlerLogger = NOOP_LOGGER,
	) {}

	async handle(event: SharedKernel.DomainEvent): Promise<void> {
		if (event.type !== 'BrandPromptCreated') return;
		const { brandPromptId, projectId, organizationId, text } = event as AiSearchInsights.BrandPromptCreated;

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
			const openaiCreds = await this.credentials.listForProvider(organizationId, {
				value: OPENAI_AUTO_SCHEDULE_DEFAULTS.providerId,
			} as ProviderConnectivity.ProviderId);
			if (openaiCreds.length === 0) {
				this.logger.info(
					{ brandPromptId, projectId },
					'no OpenAI credential found in org — skipping auto-schedule until connected',
				);
				return;
			}

			for (const location of project.locations) {
				try {
					const result = await this.scheduleEndpointFetch.execute({
						projectId,
						providerId: OPENAI_AUTO_SCHEDULE_DEFAULTS.providerId,
						endpointId: OPENAI_AUTO_SCHEDULE_DEFAULTS.endpointId,
						params: {
							prompt: text,
							locationCountry: location.country,
							locationLanguage: location.language,
							model: OPENAI_AUTO_SCHEDULE_DEFAULTS.model,
							brandPromptId,
						},
						systemParams: {
							organizationId,
							brandPromptId,
							country: location.country,
							language: location.language,
						},
						cron: OPENAI_AUTO_SCHEDULE_DEFAULTS.cron,
						credentialOverrideId: null,
					});
					this.logger.info(
						{ brandPromptId, definitionId: result.definitionId, locale: location.toString() },
						'auto-scheduled OpenAI fetch for brand prompt',
					);
				} catch (innerErr) {
					this.logger.error(
						{
							brandPromptId,
							locale: location.toString(),
							err: innerErr instanceof Error ? innerErr.message : String(innerErr),
						},
						'auto-schedule failed for one locale; continuing others',
					);
				}
			}
		} catch (err) {
			this.logger.error(
				{ brandPromptId, err: err instanceof Error ? err.message : String(err) },
				'auto-schedule failed on BrandPromptCreated — operator must schedule manually',
			);
		}
	}
}
