/**
 * Brevo occasionally returns floats during partial-window aggregations and,
 * very rarely, a missing field for a counter that should be zero. Both ACLs
 * (email-statistics and campaign-statistics) need to map those into
 * non-negative integers; sharing the helper keeps their behaviour aligned.
 */
export const toNonNegInt = (raw: number | undefined): number => {
	if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
	return Math.trunc(raw);
};
