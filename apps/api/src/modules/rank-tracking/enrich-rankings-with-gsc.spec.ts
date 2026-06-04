import { describe, expect, it } from 'vitest';
import { attachGscPositions, buildGscPositionLookup, normalizeDomain } from './enrich-rankings-with-gsc.js';

describe('enrich-rankings-with-gsc', () => {
	describe('normalizeDomain', () => {
		it('strips sc-domain:, protocol, www and trailing slash', () => {
			expect(normalizeDomain('sc-domain:guardtour.app')).toBe('guardtour.app');
			expect(normalizeDomain('https://www.guardtour.app/')).toBe('guardtour.app');
			expect(normalizeDomain('GuardTour.app')).toBe('guardtour.app');
		});
	});

	describe('buildGscPositionLookup', () => {
		it('collapses sc-domain/https/case variants of the same (domain, query) and keeps the best position', () => {
			const lookup = buildGscPositionLookup([
				{ siteUrl: 'sc-domain:guardtour.app', query: 'guard tour app', position: 30 },
				{ siteUrl: 'https://guardtour.app/', query: 'Guard Tour App', position: 24 },
			]);
			expect(lookup.size).toBe(1);
			expect([...lookup.values()]).toEqual([24]);
		});
	});

	describe('attachGscPositions', () => {
		const gsc = [
			{ siteUrl: 'sc-domain:guardtour.app', query: 'guard tour app', position: 24.2 },
			{ siteUrl: 'sc-domain:patroltech.online', query: 'patrol software', position: 8 },
		];

		it('fills gscPosition for a tracked keyword the SERP missed (domain+query match, case/format-insensitive)', () => {
			const rows = [{ domain: 'guardtour.app', phrase: 'Guard Tour App', position: null }];
			const out = attachGscPositions(rows, gsc);
			expect(out[0]?.gscPosition).toBe(24.2);
			expect(out[0]?.position).toBeNull();
		});

		it('leaves gscPosition null when no GSC row matches', () => {
			const rows = [{ domain: 'guardtour.app', phrase: 'unseen keyword', position: null }];
			expect(attachGscPositions(rows, gsc)[0]?.gscPosition).toBeNull();
		});

		it('does not cross domains: same query on a different domain stays null', () => {
			const rows = [{ domain: 'securityguardtour.com', phrase: 'guard tour app', position: null }];
			expect(attachGscPositions(rows, gsc)[0]?.gscPosition).toBeNull();
		});
	});
});
