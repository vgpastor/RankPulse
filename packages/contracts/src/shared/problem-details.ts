import { z } from 'zod';

/**
 * RFC 7807 Problem Details for HTTP error responses.
 */
export const ProblemDetails = z.object({
	type: z.string().url().describe('URI reference identifying the problem type'),
	title: z.string().describe('Short human-readable summary'),
	status: z.number().int().min(400).max(599),
	detail: z.string().optional(),
	instance: z.string().optional(),
	code: z.string().optional().describe('Domain-specific error code'),
});
export type ProblemDetails = z.infer<typeof ProblemDetails>;
