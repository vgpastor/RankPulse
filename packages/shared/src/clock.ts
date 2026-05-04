export interface Clock {
	now(): Date;
}

export const SystemClock: Clock = {
	now: () => new Date(),
};

export class FakeClock implements Clock {
	private current: Date;

	constructor(initial: Date | string) {
		this.current = typeof initial === 'string' ? new Date(initial) : new Date(initial);
	}

	now(): Date {
		return new Date(this.current);
	}

	advance(ms: number): void {
		this.current = new Date(this.current.getTime() + ms);
	}

	set(date: Date | string): void {
		this.current = typeof date === 'string' ? new Date(date) : new Date(date);
	}
}
