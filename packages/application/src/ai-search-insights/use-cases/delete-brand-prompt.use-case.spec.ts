import {
	AiSearchInsights,
	type IdentityAccess,
	type ProjectManagement,
	ProviderConnectivity,
} from '@rankpulse/domain';
import { NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryBrandPromptRepository } from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DeleteBrandPromptUseCase } from './delete-brand-prompt.use-case.js';

const ORG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const OTHER_PROJECT_ID = '22222222-2222-2222-2222-222222222222' as Uuid as ProjectManagement.ProjectId;

const buildPrompt = (id: string, text: string, projectId: ProjectManagement.ProjectId = PROJECT_ID) =>
	AiSearchInsights.BrandPrompt.register({
		id: id as Uuid as AiSearchInsights.BrandPromptId,
		organizationId: ORG_ID,
		projectId,
		text: AiSearchInsights.PromptText.create(text),
		kind: 'branded',
		now: new Date('2026-05-04T10:00:00Z'),
	});

class StubJobDefinitionRepo implements ProviderConnectivity.JobDefinitionRepository {
	readonly store = new Map<string, ProviderConnectivity.ProviderJobDefinition>();
	put(def: ProviderConnectivity.ProviderJobDefinition): void {
		this.store.set(def.id, def);
	}
	async save(d: ProviderConnectivity.ProviderJobDefinition): Promise<void> {
		this.store.set(d.id, d);
	}
	async findById(id: ProviderConnectivity.ProviderJobDefinitionId) {
		return this.store.get(id) ?? null;
	}
	async findFor() {
		return null;
	}
	async findByProjectEndpointAndSystemParam(): Promise<ProviderConnectivity.ProviderJobDefinition | null> {
		return null;
	}
	async listForProject(projectId: ProjectManagement.ProjectId) {
		return [...this.store.values()].filter((d) => d.projectId === projectId);
	}
	async delete(id: ProviderConnectivity.ProviderJobDefinitionId) {
		this.store.delete(id);
	}
}

const buildAiSearchDef = (overrides: {
	id: string;
	projectId?: ProjectManagement.ProjectId;
	providerId: string;
	endpointId: string;
	brandPromptId: string;
}) =>
	ProviderConnectivity.ProviderJobDefinition.schedule({
		id: overrides.id as ProviderConnectivity.ProviderJobDefinitionId,
		projectId: overrides.projectId ?? PROJECT_ID,
		providerId: ProviderConnectivity.ProviderId.create(overrides.providerId),
		endpointId: ProviderConnectivity.EndpointId.create(overrides.endpointId),
		params: {
			brandPromptId: overrides.brandPromptId,
			prompt: 'test',
			locationCountry: 'ES',
			locationLanguage: 'es',
			model: 'auto',
			organizationId: ORG_ID,
		},
		cron: ProviderConnectivity.CronExpression.create('0 7 * * *'),
		credentialOverrideId: null,
		now: new Date('2026-05-04T10:00:00Z'),
	});

describe('DeleteBrandPromptUseCase', () => {
	let promptRepo: InMemoryBrandPromptRepository;
	let jobDefRepo: StubJobDefinitionRepo;

	beforeEach(() => {
		promptRepo = new InMemoryBrandPromptRepository();
		jobDefRepo = new StubJobDefinitionRepo();
	});

	it('removes the prompt from the repository', async () => {
		const prompt = buildPrompt('bp-1', 'Best CRMs for solo founders?');
		await promptRepo.save(prompt);

		const useCase = new DeleteBrandPromptUseCase(promptRepo, jobDefRepo);
		await useCase.execute({ brandPromptId: prompt.id });

		expect(await promptRepo.findById(prompt.id)).toBeNull();
	});

	it('throws NotFoundError when the prompt does not exist', async () => {
		const useCase = new DeleteBrandPromptUseCase(promptRepo, jobDefRepo);
		await expect(useCase.execute({ brandPromptId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
	});

	it('only deletes the targeted prompt when several exist for the same project', async () => {
		const first = buildPrompt('bp-1', 'Best CRMs for solo founders?');
		const second = buildPrompt('bp-2', 'Top SEO tools 2026');
		await promptRepo.save(first);
		await promptRepo.save(second);

		const useCase = new DeleteBrandPromptUseCase(promptRepo, jobDefRepo);
		await useCase.execute({ brandPromptId: first.id });

		expect(await promptRepo.findById(first.id)).toBeNull();
		expect(await promptRepo.findById(second.id)).not.toBeNull();
	});

	it('rejects a re-delete on the same id with NotFoundError (already removed)', async () => {
		const prompt = buildPrompt('bp-1', 'Best CRMs for solo founders?');
		await promptRepo.save(prompt);

		const useCase = new DeleteBrandPromptUseCase(promptRepo, jobDefRepo);
		await useCase.execute({ brandPromptId: prompt.id });

		await expect(useCase.execute({ brandPromptId: prompt.id })).rejects.toBeInstanceOf(NotFoundError);
	});

	it('#174: cascades to ALL job-definitions that reference the deleted brandPromptId', async () => {
		// One BrandPrompt fans out to 4 providers × N locales. Simulate the
		// real production shape: 3 providers × 2 locales = 6 schedules tied
		// to the prompt being deleted.
		const prompt = buildPrompt('bp-cascade', 'Best B2B CRMs?');
		await promptRepo.save(prompt);

		const matching = [
			buildAiSearchDef({
				id: 'def-openai-es',
				providerId: 'openai',
				endpointId: 'openai-responses-with-web-search',
				brandPromptId: prompt.id,
			}),
			buildAiSearchDef({
				id: 'def-openai-en',
				providerId: 'openai',
				endpointId: 'openai-responses-with-web-search',
				brandPromptId: prompt.id,
			}),
			buildAiSearchDef({
				id: 'def-anthropic-es',
				providerId: 'anthropic',
				endpointId: 'anthropic-messages-with-web-search',
				brandPromptId: prompt.id,
			}),
			buildAiSearchDef({
				id: 'def-perplexity-es',
				providerId: 'perplexity',
				endpointId: 'perplexity-sonar-search',
				brandPromptId: prompt.id,
			}),
		];
		for (const def of matching) jobDefRepo.put(def);

		// Schedules belonging to a DIFFERENT prompt — must survive the cascade.
		const otherPrompt = buildPrompt('bp-other', 'Different prompt');
		await promptRepo.save(otherPrompt);
		const survivor = buildAiSearchDef({
			id: 'def-openai-other',
			providerId: 'openai',
			endpointId: 'openai-responses-with-web-search',
			brandPromptId: otherPrompt.id,
		});
		jobDefRepo.put(survivor);

		const useCase = new DeleteBrandPromptUseCase(promptRepo, jobDefRepo);
		await useCase.execute({ brandPromptId: prompt.id });

		// The prompt is gone…
		expect(await promptRepo.findById(prompt.id)).toBeNull();
		// …and all 4 of its schedules with it…
		for (const def of matching) {
			expect(await jobDefRepo.findById(def.id)).toBeNull();
		}
		// …but the other prompt's schedule is untouched.
		expect(await jobDefRepo.findById(survivor.id)).not.toBeNull();
		expect(await promptRepo.findById(otherPrompt.id)).not.toBeNull();
	});

	it('#174: does NOT touch job-definitions from other projects, even if their params happen to match', async () => {
		// Cross-project safety: `listForProject` already filters by project,
		// so a def in another project with the same brandPromptId (impossible
		// in practice because BrandPromptId is a UUID, but worth covering)
		// must not be deleted. Also verifies non-AI schedules (DataForSEO,
		// GSC, etc.) for the SAME project are left alone.
		const prompt = buildPrompt('bp-iso', 'Isolated prompt');
		await promptRepo.save(prompt);

		// Same-project non-matching def (no brandPromptId in params).
		const nonAiSameProject = ProviderConnectivity.ProviderJobDefinition.schedule({
			id: 'def-dataforseo' as ProviderConnectivity.ProviderJobDefinitionId,
			projectId: PROJECT_ID,
			providerId: ProviderConnectivity.ProviderId.create('dataforseo'),
			endpointId: ProviderConnectivity.EndpointId.create('serp-google-organic-live'),
			params: { keyword: 'k', locationCode: 2724, languageCode: 'es', device: 'desktop' },
			cron: ProviderConnectivity.CronExpression.create('0 6 * * 1'),
			credentialOverrideId: null,
			now: new Date('2026-05-04T00:00:00Z'),
		});
		jobDefRepo.put(nonAiSameProject);

		// Other-project def whose params somehow reference the same id.
		const otherProjectMatch = buildAiSearchDef({
			id: 'def-other-project',
			projectId: OTHER_PROJECT_ID,
			providerId: 'openai',
			endpointId: 'openai-responses-with-web-search',
			brandPromptId: prompt.id,
		});
		jobDefRepo.put(otherProjectMatch);

		const useCase = new DeleteBrandPromptUseCase(promptRepo, jobDefRepo);
		await useCase.execute({ brandPromptId: prompt.id });

		expect(await jobDefRepo.findById(nonAiSameProject.id)).not.toBeNull();
		expect(await jobDefRepo.findById(otherProjectMatch.id)).not.toBeNull();
	});
});
