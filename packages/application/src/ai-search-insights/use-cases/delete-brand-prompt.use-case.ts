import type { AiSearchInsights, ProviderConnectivity } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface DeleteBrandPromptCommand {
	brandPromptId: string;
}

/**
 * Deletes a BrandPrompt + cascades to its scheduled JobDefinitions.
 *
 * Historical LlmAnswers are kept (the user may want to look back at trends
 * from a prompt they removed); only the prompt and its schedules are taken
 * down.
 *
 * #174: brand_prompts has NO foreign key from `provider_job_definitions`
 * (they reference the brandPromptId via `params.brandPromptId` JSONB, not
 * via a relational column), so the database can't cascade for us. Before
 * #174 the use case deleted just the prompt and left the schedules in
 * place, causing every subsequent cron tick to fail with
 * `INGEST_PRECONDITION_FAILED: BrandPrompt … not found` until the operator
 * noticed and disabled them by hand. Now the use case enumerates schedules
 * for the project and deletes any whose `params.brandPromptId` matches the
 * prompt being removed.
 *
 * Defence-in-depth: even when this cascade fails (DB hiccup mid-cascade,
 * schedules created off-path before this fix shipped, …), the worker's
 * `INGEST_PRECONDITION_FAILED` handler now auto-disables the definition on
 * the first failed tick — no second wasted API call.
 *
 * Order: delete the schedules FIRST, then the prompt. If only the prompt
 * delete fails the worst case is an orphan prompt with no schedules,
 * which is operationally fine; if only the schedule cleanup fails (after
 * the prompt is gone) we'd leave the bug we're trying to fix.
 */
export class DeleteBrandPromptUseCase {
	constructor(
		private readonly prompts: AiSearchInsights.BrandPromptRepository,
		private readonly jobDefinitions: ProviderConnectivity.JobDefinitionRepository,
	) {}

	async execute(cmd: DeleteBrandPromptCommand): Promise<void> {
		const id = cmd.brandPromptId as AiSearchInsights.BrandPromptId;
		const prompt = await this.prompts.findById(id);
		if (!prompt) {
			throw new NotFoundError(`BrandPrompt ${cmd.brandPromptId} not found`);
		}

		// `listForProject` is the only repo method that surfaces ALL job
		// definitions in scope — there's no by-systemParam index. The fan-out
		// touches all 4 AI providers × N locales per prompt, so we'd otherwise
		// have to enumerate (provider, endpoint) tuples here, which would miss
		// any future AI provider added later. The in-app filter is O(N_defs)
		// per call but typical projects have ≤100 schedules; acceptable.
		const allDefs = await this.jobDefinitions.listForProject(prompt.projectId);
		const orphans = allDefs.filter((def) => {
			const params = def.params as Record<string, unknown>;
			return params.brandPromptId === id;
		});
		for (const def of orphans) {
			await this.jobDefinitions.delete(def.id);
		}

		await this.prompts.delete(id);
	}
}
