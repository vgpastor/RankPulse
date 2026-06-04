import { describe, expect, it } from 'vitest';
import { resolveGscCountries } from './gsc-country.js';

describe('resolveGscCountries', () => {
	it('maps a single-market project to its alpha-3 GSC country', () => {
		expect(resolveGscCountries([{ country: 'FR' }])).toEqual(['fra']);
		expect(resolveGscCountries([{ country: 'ES' }])).toEqual(['esp']);
	});

	it('maps a multi-market project to distinct alpha-3 codes', () => {
		expect([...resolveGscCountries([{ country: 'GB' }, { country: 'US' }])].sort()).toEqual(['gbr', 'usa']);
	});

	it('is case-insensitive on the alpha-2 input', () => {
		expect(resolveGscCountries([{ country: 'mx' }])).toEqual(['mex']);
	});

	it('returns [] (no filter) when there are no locations', () => {
		expect(resolveGscCountries([])).toEqual([]);
	});

	it('returns [] (no filter) when ANY location is unmapped, to avoid hiding that market', () => {
		expect(resolveGscCountries([{ country: 'GB' }, { country: 'ZZ' }])).toEqual([]);
	});
});
