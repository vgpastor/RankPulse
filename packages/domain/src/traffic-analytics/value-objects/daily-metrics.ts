import { InvalidInputError } from '@rankpulse/shared';

/**
 * GA4 metrics are flexible: which ones are present depends on the
 * dimensions/metrics requested at fetch time. We keep two parallel maps
 * (string dimensions, numeric metrics) so the read model can render
 * whatever the cron asked for without growing a dedicated column per
 * metric.
 *
 * The aggregate enforces basic shape invariants: no NaN/Infinity in
 * metrics, no empty dimension values. Anything more semantic (sessions
 * non-negative, etc.) lives at the read side and would noisy-fail
 * legitimate edge cases like GA4's `(other)` bucket.
 */
export class Ga4DailyDimensionsMetrics {
	private constructor(
		public readonly dimensions: Readonly<Record<string, string>>,
		public readonly metrics: Readonly<Record<string, number>>,
	) {}

	static create(input: {
		dimensions: Record<string, string>;
		metrics: Record<string, number>;
	}): Ga4DailyDimensionsMetrics {
		const dims: Record<string, string> = {};
		for (const [k, v] of Object.entries(input.dimensions ?? {})) {
			if (typeof k !== 'string' || k.length === 0) {
				throw new InvalidInputError('dimension keys must be non-empty strings');
			}
			if (typeof v !== 'string') {
				throw new InvalidInputError(`dimension "${k}" must be a string value`);
			}
			dims[k] = v;
		}
		const mets: Record<string, number> = {};
		for (const [k, v] of Object.entries(input.metrics ?? {})) {
			if (typeof k !== 'string' || k.length === 0) {
				throw new InvalidInputError('metric keys must be non-empty strings');
			}
			if (typeof v !== 'number' || !Number.isFinite(v)) {
				throw new InvalidInputError(`metric "${k}" must be a finite number`);
			}
			mets[k] = v;
		}
		return new Ga4DailyDimensionsMetrics(dims, mets);
	}
}
