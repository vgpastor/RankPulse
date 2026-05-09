import type { AclContext } from '@rankpulse/provider-core';
import { describe, expect, it } from 'vitest';
import type { OnPageInstantResponse } from '../endpoints/on-page-instant.js';
import { mapOnPageToCompetitorAudit } from './on-page-instant-to-competitor-audit.acl.js';

const ctx = (overrides: Partial<AclContext> = {}): AclContext => ({
	dateBucket: '2026-05-09',
	systemParams: {
		scope: 'competitor',
		competitorDomain: 'rondacontrol.es',
		projectId: 'pppppppp-pppp-pppp-pppp-pppppppppppp',
		url: 'https://rondacontrol.es/landing',
	},
	endpointParams: { url: 'https://rondacontrol.es/landing' },
	...overrides,
});

// The helper's `OnPageInstantResponse` only types the most-used fields; the
// fixture exercises the wider documented shape (schema_org, htags, content,
// page_timing, …) that the ACL reads via the `ExtraOnPageFields` cast. We
// build it as `unknown` and assert at the call site.
const fixture = {
	status_code: 20000,
	status_message: 'Ok.',
	tasks: [
		{
			status_code: 20000,
			status_message: 'Ok.',
			// `time` is read defensively — typing it as a non-declared property
			// here exercises the cast in the ACL.
			...{ time: '2026-05-09 05:55:00 +00:00' },
			result: [
				{
					items: [
						{
							url: 'https://rondacontrol.es/landing',
							status_code: 200,
							meta: {
								title: 'Competitor landing',
								description: 'Best app',
								canonical: 'https://rondacontrol.es/landing',
								htags: { h1: ['Welcome'], h2: ['a', 'b', 'c'], h3: ['x', 'y'] },
								internal_links_count: 33,
								external_links_count: 5,
								hreflang_languages: ['es', 'en'],
								og_tags: { 'og:title': 't', 'og:image': 'i' },
							},
							page_timing: {
								largest_contentful_paint: 2_100,
								duration_time: 432,
								ttfb: 180,
							},
							content: { plain_text_word_count: 1250, plain_text_size: 8_500 },
							checks: {
								is_https: true,
								is_javascript: true,
								has_amp: false,
								cumulative_layout_shift: 0.05,
							},
							schema_org: [{ '@type': 'Organization' }, { '@type': 'WebSite' }],
							size: 89_000,
							dom_size: 850,
							status_message: 'OK',
						},
					],
				},
			],
		},
	],
} as unknown as OnPageInstantResponse;

describe('mapOnPageToCompetitorAudit', () => {
	it('returns ONE fat row when scope is "competitor"', () => {
		const rows = mapOnPageToCompetitorAudit(fixture, ctx());
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			statusCode: 200,
			statusMessage: 'OK',
			title: 'Competitor landing',
			metaDescription: 'Best app',
			h1: 'Welcome',
			h2Count: 3,
			h3Count: 2,
			wordCount: 1250,
			plainTextSizeBytes: 8_500,
			internalLinksCount: 33,
			externalLinksCount: 5,
			hasSchemaOrg: true,
			schemaTypes: ['Organization', 'WebSite'],
			canonicalUrl: 'https://rondacontrol.es/landing',
			lcpMs: 2_100,
			cls: 0.05,
			ttfbMs: 180,
			domSize: 850,
			isAmp: false,
			isJavascript: true,
			isHttps: true,
			hreflangCount: 2,
			ogTagsCount: 2,
			pageSizeBytes: 89_000,
			fetchTimeMs: 432,
			redirectUrl: null,
		});
		expect(rows[0]?.observedAtProvider).toBeInstanceOf(Date);
	});

	it('returns [] when scope is not "competitor" (own / absent)', () => {
		expect(mapOnPageToCompetitorAudit(fixture, ctx({ systemParams: { scope: 'own' } }))).toEqual([]);
		expect(mapOnPageToCompetitorAudit(fixture, ctx({ systemParams: { url: 'https://x.com' } }))).toEqual([]);
	});

	it('throws when systemParams.competitorDomain is missing under scope=competitor', () => {
		expect(() =>
			mapOnPageToCompetitorAudit(
				fixture,
				ctx({
					systemParams: {
						scope: 'competitor',
						projectId: 'pppppppp-pppp-pppp-pppp-pppppppppppp',
						url: 'https://x',
					},
				}),
			),
		).toThrow(/competitorDomain/);
	});

	it('throws when systemParams.projectId is missing under scope=competitor', () => {
		expect(() =>
			mapOnPageToCompetitorAudit(
				fixture,
				ctx({
					systemParams: {
						scope: 'competitor',
						competitorDomain: 'x.es',
						url: 'https://x',
					},
				}),
			),
		).toThrow(/projectId/);
	});

	it('throws when systemParams.url is missing under scope=competitor', () => {
		expect(() =>
			mapOnPageToCompetitorAudit(
				fixture,
				ctx({
					systemParams: {
						scope: 'competitor',
						competitorDomain: 'x.es',
						projectId: 'pppppppp-pppp-pppp-pppp-pppppppppppp',
					},
				}),
			),
		).toThrow(/url/);
	});

	it('handles a payload missing the optional fields without throwing', () => {
		const minimal: OnPageInstantResponse = {
			status_code: 20000,
			status_message: 'Ok.',
			tasks: [
				{
					status_code: 20000,
					status_message: 'Ok.',
					result: [{ items: [{ url: 'https://x', status_code: 301 }] }],
				},
			],
		};
		const rows = mapOnPageToCompetitorAudit(minimal, ctx());
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			statusCode: 301,
			title: null,
			metaDescription: null,
			h1: null,
			h2Count: null,
			schemaTypes: [],
			hasSchemaOrg: false,
			lcpMs: null,
			cls: null,
		});
	});

	it('emits a status-only row when DataForSEO returns no items', () => {
		const empty: OnPageInstantResponse = {
			status_code: 20000,
			status_message: 'Ok.',
			tasks: [{ status_code: 20000, status_message: 'Ok.', result: [{ items: [] }] }],
		};
		const rows = mapOnPageToCompetitorAudit(empty, ctx());
		expect(rows).toHaveLength(1);
		expect(rows[0]?.statusCode).toBeNull();
		expect(rows[0]?.title).toBeNull();
	});
});
