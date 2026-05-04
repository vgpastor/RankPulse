export const GscPropertyTypes = {
	URL_PREFIX: 'URL_PREFIX',
	DOMAIN: 'DOMAIN',
} as const;

export type GscPropertyType = (typeof GscPropertyTypes)[keyof typeof GscPropertyTypes];

export const isGscPropertyType = (value: string): value is GscPropertyType =>
	value === 'URL_PREFIX' || value === 'DOMAIN';
