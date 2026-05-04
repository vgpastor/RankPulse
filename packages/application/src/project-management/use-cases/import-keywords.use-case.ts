import { ProjectManagement, type SharedKernel } from '@rankpulse/domain';
import { type Clock, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface ImportKeywordsCommand {
	projectId: string;
	keywordListId?: string;
	listName?: string;
	phrases: readonly { phrase: string; tags?: readonly string[] }[];
}

export interface ImportKeywordsResult {
	keywordListId: string;
	added: number;
}

export class ImportKeywordsUseCase {
	constructor(
		private readonly projects: ProjectManagement.ProjectRepository,
		private readonly lists: ProjectManagement.KeywordListRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly events: SharedKernel.EventPublisher,
	) {}

	async execute(cmd: ImportKeywordsCommand): Promise<ImportKeywordsResult> {
		const projectId = cmd.projectId as ProjectManagement.ProjectId;
		const project = await this.projects.findById(projectId);
		if (!project) {
			throw new NotFoundError(`Project ${cmd.projectId} not found`);
		}

		const now = this.clock.now();
		let list: ProjectManagement.KeywordList;
		if (cmd.keywordListId) {
			const found = await this.lists.findById(cmd.keywordListId as ProjectManagement.KeywordListId);
			if (!found) {
				throw new NotFoundError(`Keyword list ${cmd.keywordListId} not found`);
			}
			list = found;
		} else {
			const listId = this.ids.generate() as ProjectManagement.KeywordListId;
			list = ProjectManagement.KeywordList.create({
				id: listId,
				projectId,
				name: cmd.listName ?? 'Default',
				now,
			});
		}

		const entries = cmd.phrases.map((p) => ({
			id: this.ids.generate() as ProjectManagement.KeywordId,
			phrase: ProjectManagement.KeywordPhrase.create(p.phrase),
			tags: p.tags,
		}));
		list.addKeywords(entries, now);

		await this.lists.save(list);
		await this.events.publish(list.pullEvents());

		return { keywordListId: list.id, added: entries.length };
	}
}
