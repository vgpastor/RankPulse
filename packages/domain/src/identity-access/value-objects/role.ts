export const Roles = {
	OWNER: 'OWNER',
	ADMIN: 'ADMIN',
	MEMBER: 'MEMBER',
	VIEWER: 'VIEWER',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

const HIERARCHY: Record<Role, number> = {
	VIEWER: 0,
	MEMBER: 1,
	ADMIN: 2,
	OWNER: 3,
};

export const isAtLeast = (have: Role, required: Role): boolean => HIERARCHY[have] >= HIERARCHY[required];

export const isRole = (value: string): value is Role =>
	value === 'OWNER' || value === 'ADMIN' || value === 'MEMBER' || value === 'VIEWER';
