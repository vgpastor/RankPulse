import { ConflictError, InvalidInputError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { DomainName } from '../../project-management/value-objects/domain-name.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { KeywordPhrase } from '../../project-management/value-objects/keyword-phrase.js';
import type { LocationLanguage } from '../../project-management/value-objects/location-language.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { TrackedKeywordStarted } from '../events/tracked-keyword-started.js';
import type { Device } from '../value-objects/device.js';
import type { TrackedKeywordId } from '../value-objects/identifiers.js';
import { type SearchEngine, SearchEngines } from '../value-objects/search-engine.js';

export interface TrackedKeywordProps {
	id: TrackedKeywordId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	domain: DomainName;
	phrase: KeywordPhrase;
	location: LocationLanguage;
	device: Device;
	searchEngine: SearchEngine;
	pausedAt: Date | null;
	startedAt: Date;
}

/**
 * The decision to track a (project, domain, keyword, country, language, device,
 * search engine) tuple. One observation per scheduling tick produces a
 * {@link RankingObservation} in the time-series store.
 */
export class TrackedKeyword extends AggregateRoot {
	private constructor(private props: TrackedKeywordProps) {
		super();
	}

	static start(input: {
		id: TrackedKeywordId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		domain: DomainName;
		phrase: KeywordPhrase;
		location: LocationLanguage;
		device: Device;
		searchEngine?: SearchEngine;
		now: Date;
	}): TrackedKeyword {
		const tracked = new TrackedKeyword({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			domain: input.domain,
			phrase: input.phrase,
			location: input.location,
			device: input.device,
			searchEngine: input.searchEngine ?? SearchEngines.GOOGLE,
			pausedAt: null,
			startedAt: input.now,
		});
		tracked.record(
			new TrackedKeywordStarted({
				trackedKeywordId: input.id,
				projectId: input.projectId,
				domain: input.domain.value,
				phrase: input.phrase.value,
				country: input.location.country,
				language: input.location.language,
				device: tracked.props.device,
				occurredAt: input.now,
			}),
		);
		return tracked;
	}

	static rehydrate(props: TrackedKeywordProps): TrackedKeyword {
		return new TrackedKeyword(props);
	}

	pause(now: Date): void {
		if (this.props.pausedAt) {
			throw new ConflictError('Tracked keyword is already paused');
		}
		this.props = { ...this.props, pausedAt: now };
	}

	resume(): void {
		if (!this.props.pausedAt) {
			throw new InvalidInputError('Tracked keyword is not paused');
		}
		this.props = { ...this.props, pausedAt: null };
	}

	isActive(): boolean {
		return this.props.pausedAt === null;
	}

	get id(): TrackedKeywordId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get domain(): DomainName {
		return this.props.domain;
	}
	get phrase(): KeywordPhrase {
		return this.props.phrase;
	}
	get location(): LocationLanguage {
		return this.props.location;
	}
	get device(): Device {
		return this.props.device;
	}
	get searchEngine(): SearchEngine {
		return this.props.searchEngine;
	}
	get pausedAt(): Date | null {
		return this.props.pausedAt;
	}
	get startedAt(): Date {
		return this.props.startedAt;
	}
}
