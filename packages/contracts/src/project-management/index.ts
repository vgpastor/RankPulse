import { z } from 'zod';

export const ProjectKindSchema = z.enum(['OWN', 'COMPETITOR', 'SIBLING']);
export type ProjectKindDto = z.infer<typeof ProjectKindSchema>;

export const LocationLanguageSchema = z.object({
	country: z.string().regex(/^[A-Z]{2}$/),
	language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
});

export const CreateProjectRequest = z.object({
	organizationId: z.string().uuid(),
	portfolioId: z.string().uuid().nullable().default(null),
	name: z.string().min(2).max(80),
	primaryDomain: z.string().min(3).max(253),
	kind: ProjectKindSchema.optional(),
	initialLocations: z.array(LocationLanguageSchema).optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;

export const ProjectDto = z.object({
	id: z.string().uuid(),
	organizationId: z.string().uuid(),
	portfolioId: z.string().uuid().nullable(),
	name: z.string(),
	primaryDomain: z.string(),
	kind: ProjectKindSchema,
	domains: z.array(
		z.object({
			domain: z.string(),
			kind: z.enum(['main', 'subdomain', 'alias']),
		}),
	),
	locations: z.array(LocationLanguageSchema),
	archivedAt: z.string().datetime().nullable(),
	createdAt: z.string().datetime(),
});
export type ProjectDto = z.infer<typeof ProjectDto>;

export const ImportKeywordsRequest = z.object({
	keywordListId: z.string().uuid().optional(),
	listName: z.string().min(1).max(80).optional(),
	phrases: z
		.array(
			z.object({
				phrase: z.string().min(1).max(200),
				tags: z.array(z.string()).optional(),
			}),
		)
		.min(1)
		.max(2000),
});
export type ImportKeywordsRequest = z.infer<typeof ImportKeywordsRequest>;

export const AddCompetitorRequest = z.object({
	domain: z.string().min(3).max(253),
	label: z.string().max(80).optional(),
});
export type AddCompetitorRequest = z.infer<typeof AddCompetitorRequest>;

export const CreatePortfolioRequest = z.object({
	name: z.string().min(2).max(80),
});
export type CreatePortfolioRequest = z.infer<typeof CreatePortfolioRequest>;

export const RenamePortfolioRequest = z.object({
	name: z.string().min(2).max(80),
});
export type RenamePortfolioRequest = z.infer<typeof RenamePortfolioRequest>;

export const PortfolioDto = z.object({
	id: z.string().uuid(),
	organizationId: z.string().uuid(),
	name: z.string(),
	createdAt: z.string().datetime(),
	projectCount: z.number().int().nonnegative(),
});
export type PortfolioDto = z.infer<typeof PortfolioDto>;

// BACKLOG #18 — competitor auto-discovery
export const CompetitorSuggestionStatusSchema = z.enum(['PENDING', 'PROMOTED', 'DISMISSED']);
export type CompetitorSuggestionStatusDto = z.infer<typeof CompetitorSuggestionStatusSchema>;

export const CompetitorSuggestionDto = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	domain: z.string(),
	totalTop10Hits: z.number().int().nonnegative(),
	distinctKeywordsInTop10: z.number().int().nonnegative(),
	firstSeenAt: z.string().datetime(),
	lastSeenAt: z.string().datetime(),
	status: CompetitorSuggestionStatusSchema,
});
export type CompetitorSuggestionDto = z.infer<typeof CompetitorSuggestionDto>;

export const ListCompetitorSuggestionsQuery = z.object({
	eligibleOnly: z
		.union([z.literal('true'), z.literal('false')])
		.optional()
		.transform((v) => v === 'true'),
});
export type ListCompetitorSuggestionsQuery = z.infer<typeof ListCompetitorSuggestionsQuery>;

export const PromoteCompetitorSuggestionRequest = z.object({
	label: z.string().min(1).max(80).optional(),
});
export type PromoteCompetitorSuggestionRequest = z.infer<typeof PromoteCompetitorSuggestionRequest>;
