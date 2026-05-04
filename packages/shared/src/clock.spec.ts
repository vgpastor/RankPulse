import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock.js';

describe('FakeClock', () => {
	it('returns the configured instant', () => {
		const clock = new FakeClock('2026-05-04T10:00:00Z');
		expect(clock.now().toISOString()).toBe('2026-05-04T10:00:00.000Z');
	});

	it('advances time', () => {
		const clock = new FakeClock('2026-05-04T10:00:00Z');
		clock.advance(60_000);
		expect(clock.now().toISOString()).toBe('2026-05-04T10:01:00.000Z');
	});

	it('returns a fresh Date each call so callers cannot mutate it', () => {
		const clock = new FakeClock('2026-05-04T10:00:00Z');
		const a = clock.now();
		a.setUTCFullYear(1999);
		expect(clock.now().getUTCFullYear()).toBe(2026);
	});
});
