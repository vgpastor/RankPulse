import { describe, expect, it } from 'vitest';
import { andThen, err, isErr, isOk, map, mapErr, ok, unwrap } from './result.js';

describe('Result', () => {
	it('builds ok and err and discriminates them', () => {
		const a = ok(1);
		const b = err(new Error('boom'));
		expect(isOk(a)).toBe(true);
		expect(isErr(b)).toBe(true);
	});

	it('maps the ok branch only', () => {
		expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
		expect(map(err<string>('e'), (n: number) => n * 3)).toEqual(err('e'));
	});

	it('mapErr transforms the error branch only', () => {
		expect(mapErr(err('boom'), (e) => `wrapped:${e}`)).toEqual(err('wrapped:boom'));
		expect(mapErr(ok(1), (e: string) => e.toUpperCase())).toEqual(ok(1));
	});

	it('andThen chains computations', () => {
		const safeDiv = (a: number, b: number) => (b === 0 ? err('div by zero') : ok(a / b));
		expect(andThen(ok(10), (n) => safeDiv(n, 2))).toEqual(ok(5));
		expect(andThen(ok(10), (n) => safeDiv(n, 0))).toEqual(err('div by zero'));
	});

	it('unwrap returns value on ok and throws on err', () => {
		expect(unwrap(ok(7))).toBe(7);
		expect(() => unwrap(err(new Error('nope')))).toThrow('nope');
	});
});
