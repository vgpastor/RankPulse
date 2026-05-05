import { ConflictError, InvalidInputError } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import { DomainName } from '../value-objects/domain-name.js';
import type { CompetitorSuggestionId, ProjectId } from '../value-objects/identifiers.js';
import { CompetitorSuggestion } from './competitor-suggestion.js';

const SUGGESTION_ID = 'sugg-1' as CompetitorSuggestionId;
const PROJECT_ID = 'proj-1' as ProjectId;
const DOMAIN = DomainName.create('competitor.com');
const NOW = new Date('2026-05-04T10:00:00Z');

const buildPending = () =>
	CompetitorSuggestion.observe({
		id: SUGGESTION_ID,
		projectId: PROJECT_ID,
		domain: DOMAIN,
		firstSeenKeyword: 'control de rondas',
		now: NOW,
	});

describe('CompetitorSuggestion.observe', () => {
	it('starts a new PENDING suggestion with one keyword and one hit', () => {
		const s = buildPending();
		expect(s.status).toBe('PENDING');
		expect(s.totalTop10Hits).toBe(1);
		expect([...s.keywordsInTop10]).toEqual(['control de rondas']);
		expect(s.firstSeenAt).toEqual(NOW);
		expect(s.lastSeenAt).toEqual(NOW);
		expect(s.promotedAt).toBeNull();
		expect(s.dismissedAt).toBeNull();
	});

	it('rejects an empty firstSeenKeyword (cannot bootstrap with no signal)', () => {
		expect(() =>
			CompetitorSuggestion.observe({
				id: SUGGESTION_ID,
				projectId: PROJECT_ID,
				domain: DOMAIN,
				firstSeenKeyword: '   ',
				now: NOW,
			}),
		).toThrow(InvalidInputError);
	});
});

describe('recordTop10Hit', () => {
	it('adds a NEW keyword to the distinct set and bumps both counters', () => {
		const s = buildPending();
		s.recordTop10Hit('guardia jurado madrid', new Date('2026-05-05T10:00:00Z'));
		expect(s.keywordsInTop10.size).toBe(2);
		expect(s.totalTop10Hits).toBe(2);
	});

	it('counts repeated hits on the SAME keyword without inflating the distinct-keyword count', () => {
		const s = buildPending();
		s.recordTop10Hit('control de rondas', new Date('2026-05-05T10:00:00Z'));
		s.recordTop10Hit('control de rondas', new Date('2026-05-06T10:00:00Z'));
		expect(s.keywordsInTop10.size).toBe(1);
		expect(s.totalTop10Hits).toBe(3);
	});

	it('updates lastSeenAt without touching firstSeenAt', () => {
		const s = buildPending();
		const later = new Date('2026-05-10T10:00:00Z');
		s.recordTop10Hit('foo', later);
		expect(s.firstSeenAt).toEqual(NOW);
		expect(s.lastSeenAt).toEqual(later);
	});

	it('is a no-op once promoted (frozen state)', () => {
		const s = buildPending();
		s.promote(NOW);
		s.recordTop10Hit('new-keyword', new Date('2026-06-01T00:00:00Z'));
		expect(s.totalTop10Hits).toBe(1);
		expect(s.keywordsInTop10.size).toBe(1);
	});

	it('is a no-op once dismissed (frozen state)', () => {
		const s = buildPending();
		s.dismiss(NOW);
		s.recordTop10Hit('new-keyword', new Date('2026-06-01T00:00:00Z'));
		expect(s.totalTop10Hits).toBe(1);
	});
});

describe('isEligible', () => {
	it('returns true when distinct keywords ≥ minHits AND ratio ≥ minKeywordRatio', () => {
		const s = buildPending();
		s.recordTop10Hit('a', NOW);
		s.recordTop10Hit('b', NOW);
		// 3 distinct keywords / 10 project keywords = 0.3 → exactly the threshold.
		expect(s.isEligible({ projectKeywordCount: 10, minHits: 3, minKeywordRatio: 0.3 })).toBe(true);
	});

	it('returns false when below minHits', () => {
		const s = buildPending();
		expect(s.isEligible({ projectKeywordCount: 10, minHits: 3, minKeywordRatio: 0.3 })).toBe(false);
	});

	it('returns false when below the ratio (sustained but on a tiny slice of the project)', () => {
		const s = buildPending();
		s.recordTop10Hit('a', NOW);
		s.recordTop10Hit('b', NOW);
		// 3 / 100 = 0.03 → way below 0.3.
		expect(s.isEligible({ projectKeywordCount: 100, minHits: 3, minKeywordRatio: 0.3 })).toBe(false);
	});

	it('returns false when project has zero keywords (no denominator)', () => {
		const s = buildPending();
		expect(s.isEligible({ projectKeywordCount: 0, minHits: 1, minKeywordRatio: 0.0 })).toBe(false);
	});

	it('returns false once promoted or dismissed (only PENDING is eligible)', () => {
		const s = buildPending();
		s.recordTop10Hit('a', NOW);
		s.recordTop10Hit('b', NOW);
		s.dismiss(NOW);
		expect(s.isEligible({ projectKeywordCount: 10, minHits: 3, minKeywordRatio: 0.3 })).toBe(false);
	});
});

describe('promote / dismiss', () => {
	it('PENDING → PROMOTED (terminal)', () => {
		const s = buildPending();
		s.promote(NOW);
		expect(s.status).toBe('PROMOTED');
		expect(s.promotedAt).toEqual(NOW);
		expect(() => s.promote(NOW)).toThrow(ConflictError);
		expect(() => s.dismiss(NOW)).toThrow(ConflictError);
	});

	it('PENDING → DISMISSED (terminal)', () => {
		const s = buildPending();
		s.dismiss(NOW);
		expect(s.status).toBe('DISMISSED');
		expect(s.dismissedAt).toEqual(NOW);
		expect(() => s.dismiss(NOW)).toThrow(ConflictError);
		expect(() => s.promote(NOW)).toThrow(ConflictError);
	});
});

describe('rehydrate', () => {
	it('round-trips state without sharing the keyword set reference (defensive copy)', () => {
		const original = new Set(['a', 'b']);
		const s = CompetitorSuggestion.rehydrate({
			id: SUGGESTION_ID,
			projectId: PROJECT_ID,
			domain: DOMAIN,
			keywordsInTop10: original,
			totalTop10Hits: 4,
			firstSeenAt: NOW,
			lastSeenAt: NOW,
			status: 'PENDING',
			promotedAt: null,
			dismissedAt: null,
		});
		original.add('c'); // mutate caller's set
		expect(s.keywordsInTop10.has('c')).toBe(false);
		expect(s.keywordsInTop10.size).toBe(2);
	});
});
