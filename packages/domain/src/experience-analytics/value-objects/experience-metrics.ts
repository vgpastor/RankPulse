import { InvalidInputError } from '@rankpulse/shared';

/**
 * Microsoft Clarity daily UX metrics for a project. All counts are
 * non-negative integers; engagement time is non-negative seconds; scroll
 * depth is `[0, 1]` (Clarity reports it as a fraction).
 */
export class ExperienceMetrics {
	private constructor(
		public readonly sessionsCount: number,
		public readonly botSessionsCount: number,
		public readonly distinctUserCount: number,
		public readonly pagesPerSession: number,
		public readonly rageClicks: number,
		public readonly deadClicks: number,
		public readonly avgEngagementSeconds: number,
		public readonly avgScrollDepth: number,
	) {}

	static create(input: {
		sessionsCount: number;
		botSessionsCount: number;
		distinctUserCount: number;
		pagesPerSession: number;
		rageClicks: number;
		deadClicks: number;
		avgEngagementSeconds: number;
		avgScrollDepth: number;
	}): ExperienceMetrics {
		const nonNegInt = (raw: number, label: string): number => {
			if (!Number.isFinite(raw) || raw < 0) {
				throw new InvalidInputError(`${label} must be a non-negative number`);
			}
			return Math.round(raw);
		};
		const nonNegFloat = (raw: number, label: string): number => {
			if (!Number.isFinite(raw) || raw < 0) {
				throw new InvalidInputError(`${label} must be a non-negative number`);
			}
			return raw;
		};
		if (!Number.isFinite(input.avgScrollDepth) || input.avgScrollDepth < 0 || input.avgScrollDepth > 1) {
			throw new InvalidInputError('avgScrollDepth must be a fraction in [0, 1]');
		}
		return new ExperienceMetrics(
			nonNegInt(input.sessionsCount, 'sessionsCount'),
			nonNegInt(input.botSessionsCount, 'botSessionsCount'),
			nonNegInt(input.distinctUserCount, 'distinctUserCount'),
			nonNegFloat(input.pagesPerSession, 'pagesPerSession'),
			nonNegInt(input.rageClicks, 'rageClicks'),
			nonNegInt(input.deadClicks, 'deadClicks'),
			nonNegFloat(input.avgEngagementSeconds, 'avgEngagementSeconds'),
			input.avgScrollDepth,
		);
	}
}
