/**
 * Maps a project's target locations (ISO-3166 alpha-2, e.g. `GB`) to the
 * country codes GSC reports in its `country` dimension (ISO-3166 alpha-3
 * lowercase, e.g. `gbr`). Used to scope the cockpit read-models to the
 * project's market so a shared hub property doesn't show another market's
 * traffic (#199).
 *
 * Focused map of the markets RankPulse serves (extensible one line at a time,
 * like DATAFORSEO_LOCATION_CODES). Resolution is all-or-nothing: if ANY
 * location is unmapped we return `[]` (no filter) rather than risk silently
 * hiding that market's data.
 */
const ISO2_TO_ISO3: Record<string, string> = {
	ES: 'esp',
	US: 'usa',
	GB: 'gbr',
	FR: 'fra',
	MX: 'mex',
	DE: 'deu',
	IT: 'ita',
	PT: 'prt',
	NL: 'nld',
	BE: 'bel',
	IE: 'irl',
	CH: 'che',
	AT: 'aut',
	PL: 'pol',
	SE: 'swe',
	CA: 'can',
	AU: 'aus',
	AR: 'arg',
	CO: 'col',
	CL: 'chl',
	PE: 'per',
	BR: 'bra',
	UY: 'ury',
	EC: 'ecu',
};

/**
 * Distinct GSC (alpha-3 lowercase) country codes for the project's locations,
 * or `[]` when there are no locations or any location is unmapped — `[]` means
 * "do not filter by country" to the read-models.
 */
export const resolveGscCountries = (locations: readonly { country: string }[]): readonly string[] => {
	if (locations.length === 0) return [];
	const mapped = locations.map((l) => ISO2_TO_ISO3[l.country.toUpperCase()]);
	if (mapped.some((c) => c === undefined)) return [];
	return [...new Set(mapped as string[])];
};
