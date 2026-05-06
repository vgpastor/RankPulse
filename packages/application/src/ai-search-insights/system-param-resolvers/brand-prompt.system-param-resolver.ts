import type { AiSearchInsights } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import { AI_SEARCH_PROVIDER_DEFINITIONS } from '../event-handlers/auto-schedule-on-brand-prompt-created.handler.js';

/**
 * Derive the set of `(providerId, endpointId)` pairs from the canonical
 * provider list so a fifth provider added in `AI_SEARCH_PROVIDER_DEFINITIONS`
 * is automatically picked up by the resolver — no separate file to keep in
 * sync.
 */
const aiSearchEndpointKeys = (): Set<string> =>
	new Set(AI_SEARCH_PROVIDER_DEFINITIONS.map((d) => `${d.providerId}|${d.endpointId}`));

/**
 * Maps an AI-search endpoint user param payload (which carries
 * `brandPromptId` already because the auto-schedule handler put it there)
 * to the systemParams the worker's processor needs to ingest the captured
 * response into the right BrandPrompt.
 *
 * Returns `{}` for any provider/endpoint pair that isn't an AI-search one.
 * Throws when the prompt id is missing or doesn't exist — matches the
 * pattern of the other system-param resolvers (GSC/GA4/Bing/Wikipedia/...)
 * so the operator gets a clear "link the entity first" error instead of a
 * silent ingest skip downstream.
 */
export class BrandPromptSystemParamResolver implements SystemParamResolver {
	private readonly endpointKeys: Set<string>;

	constructor(private readonly prompts: AiSearchInsights.BrandPromptRepository) {
		this.endpointKeys = aiSearchEndpointKeys();
	}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		if (!this.endpointKeys.has(`${input.providerId}|${input.endpointId}`)) return {};

		const candidate = input.params.brandPromptId;
		if (typeof candidate !== 'string') {
			throw new InvalidInputError(
				`${input.endpointId} schedule requires \`params.brandPromptId\` (UUID of the BrandPrompt).`,
			);
		}

		const prompt = await this.prompts.findById(candidate as AiSearchInsights.BrandPromptId);
		if (!prompt) {
			throw new NotFoundError(
				`BrandPrompt ${candidate} not found — register it via POST /projects/${input.projectId}/brand-prompts before scheduling.`,
			);
		}

		const country = input.params.locationCountry;
		const language = input.params.locationLanguage;
		const out: Record<string, unknown> = {
			brandPromptId: prompt.id,
			organizationId: prompt.organizationId,
		};
		if (typeof country === 'string') out.country = country;
		if (typeof language === 'string') out.language = language;
		return out;
	}
}
