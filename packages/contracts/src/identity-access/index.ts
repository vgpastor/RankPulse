import { z } from 'zod';

export const RoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
export type RoleDto = z.infer<typeof RoleSchema>;

export const RegisterOrganizationRequest = z.object({
	organizationName: z.string().min(2).max(80),
	slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/),
	owner: z.object({
		email: z.string().email(),
		name: z.string().min(1).max(80),
		password: z.string().min(12).max(256),
	}),
});
export type RegisterOrganizationRequest = z.infer<typeof RegisterOrganizationRequest>;

export const RegisterOrganizationResponse = z.object({
	organizationId: z.string().uuid(),
	ownerUserId: z.string().uuid(),
	membershipId: z.string().uuid(),
});
export type RegisterOrganizationResponse = z.infer<typeof RegisterOrganizationResponse>;

export const LoginRequest = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const MeResponse = z.object({
	userId: z.string().uuid(),
	email: z.string().email(),
	name: z.string(),
	memberships: z.array(
		z.object({
			organizationId: z.string().uuid(),
			role: RoleSchema,
		}),
	),
});
export type MeResponse = z.infer<typeof MeResponse>;
