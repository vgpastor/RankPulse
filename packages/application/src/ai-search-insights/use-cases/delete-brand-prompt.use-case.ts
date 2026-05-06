import type { AiSearchInsights } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface DeleteBrandPromptCommand {
	brandPromptId: string;
}

/**
 * Deletes a BrandPrompt. Note that historical LlmAnswers are kept (the user
 * may want to look back at trends from a prompt they removed); only the
 * prompt and its scheduled JobDefinitions are taken down. The cascade of
 * job-definition deletion happens in the persistence layer via a foreign
 * key with ON DELETE CASCADE.
 */
export class DeleteBrandPromptUseCase {
	constructor(private readonly prompts: AiSearchInsights.BrandPromptRepository) {}

	async execute(cmd: DeleteBrandPromptCommand): Promise<void> {
		const id = cmd.brandPromptId as AiSearchInsights.BrandPromptId;
		const prompt = await this.prompts.findById(id);
		if (!prompt) {
			throw new NotFoundError(`BrandPrompt ${cmd.brandPromptId} not found`);
		}
		await this.prompts.delete(id);
	}
}
