import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { TrackedPageAdded } from '../events/tracked-page-added.js';
import type { TrackedPageId } from '../value-objects/identifiers.js';
import type { PageUrl } from '../value-objects/page-url.js';
import type { PageSpeedStrategy } from '../value-objects/strategy.js';

export interface TrackedPageProps {
	id: TrackedPageId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	url: PageUrl;
	strategy: PageSpeedStrategy;
	addedAt: Date;
}

/**
 * A page-strategy pair the operator wants PSI run against on a cron.
 * `(projectId, url, strategy)` is unique — same URL with mobile +
 * desktop strategies are two distinct tracked pages so the worker
 * fires two PSI calls per day.
 */
export class TrackedPage extends AggregateRoot {
	private constructor(private readonly props: TrackedPageProps) {
		super();
	}

	static add(input: {
		id: TrackedPageId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		url: PageUrl;
		strategy: PageSpeedStrategy;
		now: Date;
	}): TrackedPage {
		const page = new TrackedPage({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			url: input.url,
			strategy: input.strategy,
			addedAt: input.now,
		});
		page.record(
			new TrackedPageAdded({
				trackedPageId: input.id,
				organizationId: input.organizationId,
				projectId: input.projectId,
				url: input.url.value,
				strategy: input.strategy,
				occurredAt: input.now,
			}),
		);
		return page;
	}

	static rehydrate(props: TrackedPageProps): TrackedPage {
		return new TrackedPage(props);
	}

	get id(): TrackedPageId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get url(): PageUrl {
		return this.props.url;
	}
	get strategy(): PageSpeedStrategy {
		return this.props.strategy;
	}
	get addedAt(): Date {
		return this.props.addedAt;
	}
}
