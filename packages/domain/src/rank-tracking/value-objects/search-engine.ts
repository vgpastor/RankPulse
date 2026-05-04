export const SearchEngines = {
	GOOGLE: 'google',
} as const;

export type SearchEngine = (typeof SearchEngines)[keyof typeof SearchEngines];

export const isSearchEngine = (value: string): value is SearchEngine => value === 'google';
