import type { AiSearchInsights } from '@rankpulse/domain';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Maps an `openai-responses-with-web-search` user param payload (which
 * carries `brandPromptId` already because the auto-schedule handler put it
 * there) to the systemParams the worker's processor needs to ingest the
 * captured response into the right BrandPrompt.
 *
 * Issue #56 / family of bugs: this resolver is registered alongside the
 * existing GSC/GA4/PSI/Wikipedia/Bing resolvers in composition-root so
 * a manual `POST /providers/.../schedule` call (by an operator who skips
 * the BrandPrompt UI and goes straight to the SchedulesPage) still gets
 * the correct systemParams populated. Returns `{}` for any other
 * provider/endpoint pair.
 */
export class BrandPromptSystemParamResolver implements SystemParamResolver {
	constructor(private readonly prompts: AiSearchInsights.BrandPromptRepository) {}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		if (input.providerId !== 'openai') return {};
		if (input.endpointId !== 'openai-responses-with-web-search') return {};

		const candidate = input.params['brandPromptId'];
		if (typeof candidate !== 'string') return {};

		const prompt = await this.prompts.findById(candidate as AiSearchInsights.BrandPromptId);
		if (!prompt) return {};

		const country = input.params['locationCountry'];
		const language = input.params['locationLanguage'];
		const out: Record<string, unknown> = {
			brandPromptId: prompt.id,
			organizationId: prompt.organizationId,
		};
		if (typeof country === 'string') out['country'] = country;
		if (typeof language === 'string') out['language'] = language;
		return out;
	}
}
