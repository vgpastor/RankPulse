import { z } from 'zod';

export const LinkWikipediaArticleRequest = z.object({
	wikipediaProject: z
		.string()
		.regex(/^[a-z]{2,3}(?:-[a-z]+)?\.wikipedia\.org$/, 'project must be like "en.wikipedia.org"'),
	slug: z.string().min(1).max(255),
	label: z.string().min(1).max(120).optional(),
});
export type LinkWikipediaArticleRequest = z.infer<typeof LinkWikipediaArticleRequest>;

export const WikipediaArticleDto = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	wikipediaProject: z.string(),
	slug: z.string(),
	label: z.string(),
	linkedAt: z.string().datetime(),
	unlinkedAt: z.string().datetime().nullable(),
});
export type WikipediaArticleDto = z.infer<typeof WikipediaArticleDto>;

export const WikipediaPageviewQuery = z.object({
	from: z.string().datetime().optional(),
	to: z.string().datetime().optional(),
});
export type WikipediaPageviewQuery = z.infer<typeof WikipediaPageviewQuery>;

export const WikipediaPageviewDto = z.object({
	observedAt: z.string().datetime(),
	views: z.number().int().nonnegative(),
	access: z.string(),
	agent: z.string(),
	granularity: z.string(),
});
export type WikipediaPageviewDto = z.infer<typeof WikipediaPageviewDto>;
