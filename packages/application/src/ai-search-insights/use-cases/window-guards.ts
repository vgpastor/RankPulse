import { InvalidInputError } from '@rankpulse/shared';

/**
 * Max date range a dashboard / read-model query is allowed to span. 365 days
 * is generous for a year-over-year compare without letting a malformed call
 * (or a malicious one) trigger an unbounded scan over the `llm_answers`
 * hypertable.
 */
const MAX_RANGE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface NormalisedWindow {
	readonly from: Date;
	readonly to: Date;
}

export const normaliseDashboardWindow = (
	input: { from?: Date; to?: Date },
	defaultDays: number,
): NormalisedWindow => {
	const to = input.to ?? new Date();
	const from = input.from ?? new Date(to.getTime() - defaultDays * MS_PER_DAY);
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
		throw new InvalidInputError('Window bounds must be valid dates');
	}
	if (from.getTime() > to.getTime()) {
		throw new InvalidInputError('Window `from` must be before `to`');
	}
	const spanDays = (to.getTime() - from.getTime()) / MS_PER_DAY;
	if (spanDays > MAX_RANGE_DAYS) {
		throw new InvalidInputError(
			`Window span exceeds ${MAX_RANGE_DAYS} days (got ${spanDays.toFixed(0)} days). Narrow the from/to range or rely on the default window.`,
		);
	}
	return { from, to };
};
