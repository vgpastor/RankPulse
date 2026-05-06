import {
	AiSearchInsights,
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { type Clock, ConflictError, type IdGenerator } from '@rankpulse/shared';

export interface RegisterBrandPromptCommand {
	organizationId: string;
	projectId: string;
	text: string;
	kind: AiSearchInsights.PromptKind;
}

export interface RegisterBrandPromptResult {
	brandPromptId: string;
}

/**
 * Creates a new BrandPrompt. The auto-schedule handler subscribed to
 * `BrandPromptCreated` is responsible for fanning out one JobDefinition per
 * (location × connected AI provider). This use case is intentionally
 * unaware of scheduling.
 */
export class RegisterBrandPromptUseCase {
	constructor(
		private readonly prompts: AiSearchInsights.BrandPromptRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: RegisterBrandPromptCommand): Promise<RegisterBrandPromptResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const text = AiSearchInsights.PromptText.create(cmd.text);

		const existing = await this.prompts.findExisting(projectId, text.value);
		if (existing) {
			throw new ConflictError(`A BrandPrompt with the same text already exists for this project`);
		}

		const id = this.ids.generate() as AiSearchInsights.BrandPromptId;
		const prompt = AiSearchInsights.BrandPrompt.register({
			id,
			organizationId: cmd.organizationId as IdentityAccess.OrganizationId,
			projectId,
			text,
			kind: cmd.kind,
			now: this.clock.now(),
		});

		await this.prompts.save(prompt);
		await this.events.publish(prompt.pullEvents());

		return { brandPromptId: id };
	}
}
