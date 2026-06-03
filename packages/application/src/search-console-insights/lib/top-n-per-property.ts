/**
 * Groups scored rows by their GSC property and keeps the top-N of each, so a
 * project with several linked properties surfaces every property's
 * opportunities instead of letting the highest-volume one monopolise a single
 * global top-N list (#196). Returns the union re-sorted by score descending for
 * a stable default order; callers that section by property regroup client-side.
 */
export const topNPerProperty = <T extends { siteUrl: string }>(
	rows: readonly T[],
	perPropertyLimit: number,
	score: (row: T) => number,
): T[] => {
	const byProperty = new Map<string, T[]>();
	for (const row of rows) {
		const bucket = byProperty.get(row.siteUrl);
		if (bucket) bucket.push(row);
		else byProperty.set(row.siteUrl, [row]);
	}
	const kept: T[] = [];
	for (const bucket of byProperty.values()) {
		bucket.sort((a, b) => score(b) - score(a));
		kept.push(...bucket.slice(0, perPropertyLimit));
	}
	kept.sort((a, b) => score(b) - score(a));
	return kept;
};
