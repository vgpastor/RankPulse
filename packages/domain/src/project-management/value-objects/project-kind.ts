export const ProjectKinds = {
	OWN: 'OWN',
	COMPETITOR: 'COMPETITOR',
	SIBLING: 'SIBLING',
} as const;

export type ProjectKind = (typeof ProjectKinds)[keyof typeof ProjectKinds];

export const isProjectKind = (value: string): value is ProjectKind =>
	value === 'OWN' || value === 'COMPETITOR' || value === 'SIBLING';
