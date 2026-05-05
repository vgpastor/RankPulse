import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { TrackedKeyword } from '../entities/tracked-keyword.js';
import type { TrackedKeywordId } from '../value-objects/identifiers.js';

export interface TrackedKeywordRepository {
	save(tracked: TrackedKeyword): Promise<void>;
	findById(id: TrackedKeywordId): Promise<TrackedKeyword | null>;
	findExisting(input: {
		projectId: ProjectId;
		domain: string;
		phrase: string;
		country: string;
		language: string;
		device: string;
		searchEngine: string;
	}): Promise<TrackedKeyword | null>;
	listForProject(projectId: ProjectId): Promise<readonly TrackedKeyword[]>;
	listForOrganization(orgId: OrganizationId): Promise<readonly TrackedKeyword[]>;
	/**
	 * BACKLOG #18 read model: the eligibility ratio for competitor
	 * suggestions divides keywordsInTop10 by the project's tracked-keyword
	 * count. This avoids hydrating every aggregate just to read `.length`.
	 */
	countForProject(projectId: ProjectId): Promise<number>;
	/**
	 * BACKLOG #15: returns every tracked keyword sharing the same SERP query
	 * (project + phrase + country + language + device). The processor uses
	 * this to fan one SERP fetch into N RankingObservations — one per
	 * project domain that matches in the top-N. Replaces the old
	 * per-domain JobDefinition pattern.
	 */
	listByProjectQuery(input: {
		projectId: ProjectId;
		phrase: string;
		country: string;
		language: string;
		device: string;
	}): Promise<readonly TrackedKeyword[]>;
}
