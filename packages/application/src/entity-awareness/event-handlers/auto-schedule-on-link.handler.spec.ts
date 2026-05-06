import {
	EntityAwareness,
	type IdentityAccess,
	type ProjectManagement,
	type SharedKernel,
} from '@rankpulse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleEndpointFetchUseCase } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';
import {
	AutoScheduleOnWikipediaArticleLinkedHandler,
	WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS,
} from './auto-schedule-on-link.handler.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const ARTICLE_ID = '55555555-5555-5555-5555-555555555555' as EntityAwareness.WikipediaArticleId;
const WIKI_PROJECT = 'en.wikipedia.org';
const ARTICLE_SLUG = 'TypeScript';

const buildEvent = (overrides: Partial<EntityAwareness.WikipediaArticleLinked> = {}) =>
	new EntityAwareness.WikipediaArticleLinked({
		articleId: ARTICLE_ID,
		projectId: PROJECT_ID,
		organizationId: ORG_ID,
		wikipediaProject: WIKI_PROJECT,
		slug: ARTICLE_SLUG,
		occurredAt: new Date('2026-05-04T10:00:00Z'),
		...overrides,
	});

const buildHandler = () => {
	const execute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
	const logger = { info: vi.fn(), error: vi.fn() };
	const handler = new AutoScheduleOnWikipediaArticleLinkedHandler(useCase, logger);
	return { handler, execute, logger };
};

describe('AutoScheduleOnWikipediaArticleLinkedHandler', () => {
	it('ignores events of other types', async () => {
		const { handler, execute } = buildHandler();
		const otherEvent = {
			type: 'GscPropertyLinked',
			occurredAt: new Date(),
		} as unknown as SharedKernel.DomainEvent;
		await handler.handle(otherEvent);
		expect(execute).not.toHaveBeenCalled();
	});

	it('on WikipediaArticleLinked, calls ScheduleEndpointFetch with defaults + idempotencyKey {wikipediaArticleId}', async () => {
		const { handler, execute } = buildHandler();
		await handler.handle(buildEvent());
		const cmd = execute.mock.calls[0]?.[0] as Parameters<ScheduleEndpointFetchUseCase['execute']>[0];
		expect(cmd).toMatchObject({
			projectId: PROJECT_ID,
			providerId: 'wikipedia',
			endpointId: 'wikipedia-pageviews-per-article',
			cron: '0 6 * * *',
			credentialOverrideId: null,
			idempotencyKey: { systemParamKey: 'wikipediaArticleId', systemParamValue: ARTICLE_ID },
		});
		expect(cmd.systemParams).toEqual({ organizationId: ORG_ID, wikipediaArticleId: ARTICLE_ID });
		expect(cmd.params).toMatchObject({ project: WIKI_PROJECT, article: ARTICLE_SLUG });
	});

	it('SWALLOWS errors and logs', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('boom'));
		const useCase = { execute } as unknown as ScheduleEndpointFetchUseCase;
		const logger = { info: vi.fn(), error: vi.fn() };
		const handler = new AutoScheduleOnWikipediaArticleLinkedHandler(useCase, logger);
		await expect(handler.handle(buildEvent())).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalled();
	});

	it('exposes its defaults', () => {
		expect(WIKIPEDIA_AUTO_SCHEDULE_DEFAULTS).toMatchObject({
			providerId: 'wikipedia',
			endpointId: 'wikipedia-pageviews-per-article',
			cron: '0 6 * * *',
		});
	});
});
