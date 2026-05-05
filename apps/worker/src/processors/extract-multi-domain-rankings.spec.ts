import { type IdentityAccess, ProjectManagement, RankTracking } from '@rankpulse/domain';
import type { SerpLiveResponse } from '@rankpulse/provider-dataforseo';
import { describe, expect, it } from 'vitest';
import { extractMultiDomainRankings, isMultiDomainSerpJob } from './extract-multi-domain-rankings.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;

const buildKeyword = (id: string, domain: string): RankTracking.TrackedKeyword =>
	RankTracking.TrackedKeyword.start({
		id: id as RankTracking.TrackedKeywordId,
		organizationId: ORG_ID,
		projectId: PROJECT_ID,
		domain: ProjectManagement.DomainName.create(domain),
		phrase: ProjectManagement.KeywordPhrase.create('control de rondas'),
		location: ProjectManagement.LocationLanguage.create({ country: 'ES', language: 'es' }),
		device: 'desktop',
		now: new Date('2026-05-04T00:00:00Z'),
	});

const SERP_FIXTURE: SerpLiveResponse = {
	status_code: 20000,
	status_message: 'Ok.',
	tasks: [
		{
			status_code: 20000,
			status_message: 'Ok.',
			result: [
				{
					keyword: 'control de rondas',
					location_code: 2724,
					language_code: 'es',
					items: [
						{
							type: 'organic',
							rank_absolute: 1,
							rank_group: 1,
							domain: 'todoelectronica.com',
							url: 'https://todoelectronica.com/',
						},
						{
							type: 'organic',
							rank_absolute: 3,
							rank_group: 3,
							domain: 'controlrondas.com',
							url: 'https://controlrondas.com/',
						},
						{
							type: 'organic',
							rank_absolute: 8,
							rank_group: 8,
							domain: 'patroltech.online',
							url: 'https://patroltech.online/',
						},
					],
				},
			],
		},
	],
};

describe('extractMultiDomainRankings', () => {
	it('returns one extraction per tracked keyword in a single SERP pass', () => {
		const keywords = [
			buildKeyword('tk-todo', 'todoelectronica.com'),
			buildKeyword('tk-control', 'controlrondas.com'),
			buildKeyword('tk-patrol', 'patroltech.online'),
		];

		const out = extractMultiDomainRankings(SERP_FIXTURE, keywords);

		expect(out).toHaveLength(3);
		expect(out.find((o) => o.trackedKeywordId === 'tk-todo')?.extraction.position).toBe(1);
		expect(out.find((o) => o.trackedKeywordId === 'tk-control')?.extraction.position).toBe(3);
		expect(out.find((o) => o.trackedKeywordId === 'tk-patrol')?.extraction.position).toBe(8);
	});

	it('emits a null-position extraction for tracked keywords whose domain is absent from the SERP', () => {
		const keywords = [
			buildKeyword('tk-control', 'controlrondas.com'),
			buildKeyword('tk-missing', 'never-ranks.example'),
		];

		const out = extractMultiDomainRankings(SERP_FIXTURE, keywords);

		expect(out).toHaveLength(2);
		expect(out.find((o) => o.trackedKeywordId === 'tk-control')?.extraction.position).toBe(3);
		expect(out.find((o) => o.trackedKeywordId === 'tk-missing')?.extraction.position).toBeNull();
	});

	it('dedups by normalized domain (Foo.com == foo.com == www.foo.com); first wins', () => {
		const keywords = [
			buildKeyword('tk-canonical', 'controlrondas.com'),
			buildKeyword('tk-www', 'www.controlrondas.com'),
		];

		const out = extractMultiDomainRankings(SERP_FIXTURE, keywords);

		// Only ONE extraction emitted, not two — the second tracked_keyword
		// is a near-duplicate and would clash on (tracked_keyword,
		// raw_payload) anyway.
		expect(out).toHaveLength(1);
		expect(out[0]?.trackedKeywordId).toBe('tk-canonical');
		expect(out[0]?.extraction.position).toBe(3);
	});

	it('returns an empty array when there are no tracked keywords (cheap short-circuit)', () => {
		expect(extractMultiDomainRankings(SERP_FIXTURE, [])).toEqual([]);
	});
});

describe('isMultiDomainSerpJob', () => {
	it('accepts the new shape (projectId + phrase + country + language + device)', () => {
		expect(
			isMultiDomainSerpJob({
				projectId: PROJECT_ID,
				phrase: 'control de rondas',
				country: 'ES',
				language: 'es',
				device: 'desktop',
			}),
		).toBe(true);
	});

	it('rejects old per-domain params (`domain` set, `projectId` missing)', () => {
		expect(
			isMultiDomainSerpJob({ phrase: 'control de rondas', country: 'ES', language: 'es', device: 'desktop' }),
		).toBe(false);
	});

	it('rejects partial params', () => {
		expect(isMultiDomainSerpJob({ projectId: PROJECT_ID, phrase: 'x' })).toBe(false);
	});
});
