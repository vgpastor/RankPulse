import type { AiSearchInsights, SharedKernel } from '@rankpulse/domain';
import { type Clock, NotFoundError } from '@rankpulse/shared';

export interface PauseBrandPromptCommand {
	brandPromptId: string;
}

export interface BrandPromptStateResult {
	brandPromptId: string;
	pausedAt: string | null;
}

export class PauseBrandPromptUseCase {
	constructor(
		private readonly prompts: AiSearchInsights.BrandPromptRepository,
		private readonly clock: Clock,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: PauseBrandPromptCommand): Promise<BrandPromptStateResult> {
		const id = cmd.brandPromptId as AiSearchInsights.BrandPromptId;
		const prompt = await this.prompts.findById(id);
		if (!prompt) {
			throw new NotFoundError(`BrandPrompt ${cmd.brandPromptId} not found`);
		}
		if (prompt.isActive()) {
			prompt.pause(this.clock.now());
			await this.prompts.save(prompt);
			await this.events.publish(prompt.pullEvents());
		}
		return { brandPromptId: id, pausedAt: prompt.pausedAt?.toISOString() ?? null };
	}
}

export class ResumeBrandPromptUseCase {
	constructor(
		private readonly prompts: AiSearchInsights.BrandPromptRepository,
		private readonly clock: Clock,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: PauseBrandPromptCommand): Promise<BrandPromptStateResult> {
		const id = cmd.brandPromptId as AiSearchInsights.BrandPromptId;
		const prompt = await this.prompts.findById(id);
		if (!prompt) {
			throw new NotFoundError(`BrandPrompt ${cmd.brandPromptId} not found`);
		}
		if (!prompt.isActive()) {
			prompt.resume(this.clock.now());
			await this.prompts.save(prompt);
			await this.events.publish(prompt.pullEvents());
		}
		return { brandPromptId: id, pausedAt: prompt.pausedAt?.toISOString() ?? null };
	}
}
