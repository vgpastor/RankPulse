import { ConflictError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { WikipediaArticleLinked } from '../events/wikipedia-article-linked.js';
import { WikipediaArticleUnlinked } from '../events/wikipedia-article-unlinked.js';
import type { ArticleSlug } from '../value-objects/article-slug.js';
import type { WikipediaArticleId } from '../value-objects/identifiers.js';
import type { WikipediaProject } from '../value-objects/wikipedia-project.js';

export interface WikipediaArticleProps {
	id: WikipediaArticleId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	wikipediaProject: WikipediaProject;
	slug: ArticleSlug;
	/** Free-form label for the UI (e.g. "Our brand on en.wp"). */
	label: string;
	linkedAt: Date;
	unlinkedAt: Date | null;
}

/**
 * Aggregate: a Wikipedia article that an operator has linked to a
 * RankPulse project as a brand / competitor / entity awareness signal.
 * The article itself is identified by `(wikipediaProject, slug)`; we
 * also persist the org + project context so multi-tenant isolation
 * is enforced at the read model.
 *
 * State machine:
 *   linked (active) → unlinked (terminal-ish; can be re-linked which
 *     produces a NEW aggregate with a fresh id, since the operator
 *     deciding to re-track is a distinct event we want in the audit
 *     trail).
 */
export class WikipediaArticle extends AggregateRoot {
	private constructor(private props: WikipediaArticleProps) {
		super();
	}

	static link(input: {
		id: WikipediaArticleId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		wikipediaProject: WikipediaProject;
		slug: ArticleSlug;
		label?: string;
		now: Date;
	}): WikipediaArticle {
		const article = new WikipediaArticle({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			wikipediaProject: input.wikipediaProject,
			slug: input.slug,
			label: (input.label ?? input.slug.value).trim() || input.slug.value,
			linkedAt: input.now,
			unlinkedAt: null,
		});
		article.record(
			new WikipediaArticleLinked({
				articleId: input.id,
				organizationId: input.organizationId,
				projectId: input.projectId,
				wikipediaProject: input.wikipediaProject.value,
				slug: input.slug.value,
				occurredAt: input.now,
			}),
		);
		return article;
	}

	static rehydrate(props: WikipediaArticleProps): WikipediaArticle {
		return new WikipediaArticle(props);
	}

	unlink(now: Date): void {
		if (this.props.unlinkedAt !== null) {
			throw new ConflictError(`Wikipedia article ${this.props.id} is already unlinked`);
		}
		this.props = { ...this.props, unlinkedAt: now };
		this.record(
			new WikipediaArticleUnlinked({
				articleId: this.props.id,
				projectId: this.props.projectId,
				occurredAt: now,
			}),
		);
	}

	isActive(): boolean {
		return this.props.unlinkedAt === null;
	}

	get id(): WikipediaArticleId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get wikipediaProject(): WikipediaProject {
		return this.props.wikipediaProject;
	}
	get slug(): ArticleSlug {
		return this.props.slug;
	}
	get label(): string {
		return this.props.label;
	}
	get linkedAt(): Date {
		return this.props.linkedAt;
	}
	get unlinkedAt(): Date | null {
		return this.props.unlinkedAt;
	}
}
