/**
 * Helpers for rendering cockpit rows grouped by their GSC property.
 *
 * The cockpit read-model returns one row per (property, query) so a project
 * with several linked properties shows each property's opportunities instead
 * of letting the dominant one mask the siblings (#196). The SPA sections the
 * rows by `siteUrl`; these helpers keep that logic in one place.
 */

/** `sc-domain:patroltech.online` → `patroltech.online`; strips protocol/trailing slash for URL-prefix properties. */
export const siteHost = (siteUrl: string): string =>
	siteUrl
		.replace(/^sc-domain:/, '')
		.replace(/^https?:\/\//, '')
		.replace(/\/$/, '');

/** Groups rows by `siteUrl`, preserving the incoming order within each group and across groups (first-seen). */
export const groupBySiteUrl = <T extends { siteUrl: string }>(
	rows: readonly T[],
): Array<{ siteUrl: string; rows: T[] }> => {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const bucket = groups.get(row.siteUrl);
		if (bucket) bucket.push(row);
		else groups.set(row.siteUrl, [row]);
	}
	return [...groups.entries()].map(([siteUrl, groupRows]) => ({ siteUrl, rows: groupRows }));
};
