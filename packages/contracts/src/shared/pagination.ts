import { z } from 'zod';

export const PaginationQuery = z.object({
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export const PageMeta = z.object({
	nextCursor: z.string().nullable(),
	limit: z.number().int(),
});
export type PageMeta = z.infer<typeof PageMeta>;
