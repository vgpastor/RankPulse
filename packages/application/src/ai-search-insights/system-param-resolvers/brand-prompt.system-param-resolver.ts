import type { AiSearchInsights } from '@rankpulse/domain';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Set of `(providerId, endpointId)` pairs the AI Brand Radar fan-out can
 * target. Kept here (not in the AutoSchedule handler) so a manual
 * `POST /providers/.../schedule` call against any of these endpoints picks
 * up the same systemParams plumbing — issue #56 / bug-50 family.
 */
const AI_SEARCH_ENDPOINT_KEYS = new Set<string>([
	'openai|openai-responses-with-web-search',
	'anthropic|anthropic-messages-with-web-search',
	'perplexity|perplexity-sonar-search',
	'google-ai-studio|google-ai-studio-gemini-grounded',
]);

/**
 * Maps an AI-search endpoint user param payload (which carries
 * `brandPromptId` already because the auto-schedule handler put it there)
 * to the systemParams the worker's processor needs to ingest the captured
 * response into the right BrandPrompt.
 *
 * Returns `{}` for any provider/endpoint pair that isn't an AI-search one.
 */
export class BrandPromptSystemParamResolver implements SystemParamResolver {
	constructor(private readonly prompts: AiSearchInsights.BrandPromptRepository) {}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		if (!AI_SEARCH_ENDPOINT_KEYS.has(`${input.providerId}|${input.endpointId}`)) return {};

		const candidate = input.params.brandPromptId;
		if (typeof candidate !== 'string') return {};

		const prompt = await this.prompts.findById(candidate as AiSearchInsights.BrandPromptId);
		if (!prompt) return {};

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
