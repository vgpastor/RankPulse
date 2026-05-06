import type { EntityAwareness } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import { describe, expect, it, vi } from 'vitest';
import { WikipediaArticleSystemParamResolver } from './wikipedia-article.system-param-resolver.js';

const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const articleId = 'pppppppp-pppp-pppp-pppp-pppppppppppp';

const aLinked = (): EntityAwareness.WikipediaArticle =>
	({ id: articleId, isActive: () => true }) as unknown as EntityAwareness.WikipediaArticle;

describe('WikipediaArticleSystemParamResolver', () => {
	it('returns wikipediaArticleId on match', async () => {
		const repo = {
			findByProjectAndSlug: vi.fn().mockResolvedValue(aLinked()),
		} as unknown as EntityAwareness.WikipediaArticleRepository;
		const r = new WikipediaArticleSystemParamResolver(repo);
		const out = await r.resolve({
			projectId,
			providerId: 'wikipedia',
			endpointId: 'wikipedia-pageviews-per-article',
			params: { project: 'en.wikipedia.org', article: 'PatrolTech' },
		});
		expect(out).toEqual({ wikipediaArticleId: articleId });
	});

	it('returns {} for other endpoints', async () => {
		const repo = { findByProjectAndSlug: vi.fn() } as unknown as EntityAwareness.WikipediaArticleRepository;
		const r = new WikipediaArticleSystemParamResolver(repo);
		expect(await r.resolve({ projectId, providerId: 'dataforseo', endpointId: 'serp', params: {} })).toEqual(
			{},
		);
	});

	it('throws InvalidInputError on missing project or article', async () => {
		const repo = { findByProjectAndSlug: vi.fn() } as unknown as EntityAwareness.WikipediaArticleRepository;
		const r = new WikipediaArticleSystemParamResolver(repo);
		await expect(
			r.resolve({
				projectId,
				providerId: 'wikipedia',
				endpointId: 'wikipedia-pageviews-per-article',
				params: { article: 'X' },
			}),
		).rejects.toBeInstanceOf(InvalidInputError);
	});
});
