import { ConflictError, InvalidInputError } from '@rankpulse/shared';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { KeywordsAdded } from '../events/keywords-added.js';
import type { KeywordId, KeywordListId, ProjectId } from '../value-objects/identifiers.js';
import type { KeywordPhrase } from '../value-objects/keyword-phrase.js';

export interface KeywordEntry {
	id: KeywordId;
	phrase: KeywordPhrase;
	tags: readonly string[];
}

export interface KeywordListProps {
	id: KeywordListId;
	projectId: ProjectId;
	name: string;
	keywords: KeywordEntry[];
	createdAt: Date;
}

export class KeywordList extends AggregateRoot {
	private constructor(private props: KeywordListProps) {
		super();
	}

	static create(input: {
		id: KeywordListId;
		projectId: ProjectId;
		name: string;
		now: Date;
	}): KeywordList {
		const name = input.name.trim();
		if (name.length < 1) {
			throw new InvalidInputError('Keyword list name cannot be empty');
		}
		return new KeywordList({
			id: input.id,
			projectId: input.projectId,
			name,
			keywords: [],
			createdAt: input.now,
		});
	}

	static rehydrate(props: KeywordListProps): KeywordList {
		return new KeywordList({ ...props, keywords: [...props.keywords] });
	}

	addKeywords(
		entries: readonly { id: KeywordId; phrase: KeywordPhrase; tags?: readonly string[] }[],
		now: Date,
	): void {
		if (entries.length === 0) {
			throw new InvalidInputError('Cannot add an empty batch of keywords');
		}
		const added: KeywordEntry[] = [];
		for (const entry of entries) {
			if (this.props.keywords.some((k) => k.phrase.equals(entry.phrase))) {
				throw new ConflictError(`Keyword "${entry.phrase.value}" already in list`);
			}
			const tags = (entry.tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0);
			const created: KeywordEntry = { id: entry.id, phrase: entry.phrase, tags };
			this.props.keywords.push(created);
			added.push(created);
		}
		this.record(
			new KeywordsAdded({
				keywordListId: this.props.id,
				projectId: this.props.projectId,
				phrases: added.map((a) => a.phrase.value),
				occurredAt: now,
			}),
		);
	}

	get id(): KeywordListId {
		return this.props.id;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get name(): string {
		return this.props.name;
	}
	get keywords(): readonly KeywordEntry[] {
		return this.props.keywords;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
}
