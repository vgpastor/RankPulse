export const PageSpeedStrategies = {
	MOBILE: 'mobile',
	DESKTOP: 'desktop',
} as const;
export type PageSpeedStrategy = (typeof PageSpeedStrategies)[keyof typeof PageSpeedStrategies];

export const isPageSpeedStrategy = (value: unknown): value is PageSpeedStrategy =>
	value === 'mobile' || value === 'desktop';
