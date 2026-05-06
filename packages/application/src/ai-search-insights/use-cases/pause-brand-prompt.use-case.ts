import type { AiSearchInsights, SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface PauseBrandPromptCommand {
	brandPromptId: string;
}

export class PauseBrandPromptUseCase {
	constructor(
		private readonly prompts: AiSearchInsights.BrandPromptRepository,
		private readonly clock: Clock,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: PauseBrandPromptCommand): Promise<void> {
		const id = cmd.brandPromptId as AiSearchInsights.BrandPromptId;
		const prompt = await this.prompts.findById(id);
		if (!prompt) {
			throw new NotFoundError(`BrandPrompt ${cmd.brandPromptId} not found`);
		}
		prompt.pause(this.clock.now());
		await this.prompts.save(prompt);
		await this.events.publish(prompt.pullEvents());
	}
}

export class ResumeBrandPromptUseCase {
	constructor(
		private readonly prompts: AiSearchInsights.BrandPromptRepository,
		private readonly clock: Clock,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: PauseBrandPromptCommand): Promise<void> {
		const id = cmd.brandPromptId as AiSearchInsights.BrandPromptId;
		const prompt = await this.prompts.findById(id);
		if (!prompt) {
			throw new NotFoundError(`BrandPrompt ${cmd.brandPromptId} not found`);
		}
		prompt.resume(this.clock.now());
		await this.prompts.save(prompt);
		await this.events.publish(prompt.pullEvents());
	}
}
