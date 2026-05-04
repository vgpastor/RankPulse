export const Devices = {
	DESKTOP: 'desktop',
	MOBILE: 'mobile',
} as const;

export type Device = (typeof Devices)[keyof typeof Devices];

export const isDevice = (value: string): value is Device => value === 'desktop' || value === 'mobile';
