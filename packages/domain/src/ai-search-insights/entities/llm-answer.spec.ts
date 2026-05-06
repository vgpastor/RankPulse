import { Uuid } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { LocationLanguage } from '../../project-management/value-objects/location-language.js';
import { AiProviderNames } from '../value-objects/ai-provider-name.js';
import { BrandMention } from '../value-objects/brand-mention.js';
import { Citation } from '../value-objects/citation.js';
import type { BrandPromptId, LlmAnswerId } from '../value-objects/identifiers.js';
import { TokenUsage } from '../value-objects/token-usage.js';
import { LlmAnswer } from './llm-answer.js';

const makeBaseInput = () => ({
	id: Uuid.generate() as LlmAnswerId,
	brandPromptId: Uuid.generate() as BrandPromptId,
	projectId: Uuid.generate() as ProjectId,
	aiProvider: AiProviderNames.OPENAI,
	model: 'gpt-5-mini',
	location: LocationLanguage.create({ country: 'ES', language: 'es' }),
	rawText: 'Patroltech is a great option.',
	tokenUsage: TokenUsage.zero(),
	costCents: 3.5,
	rawPayloadId: null,
	now: new Date('2026-05-06T07:00:00Z'),
});

describe('LlmAnswer', () => {
	it('emits LlmAnswerRecorded with own-brand metadata when the citation matches an own domain', () => {
		const ownCitation = Citation.create({
			url: 'https://patroltech.com/security',
			domain: 'patroltech.com',
			isOwnDomain: true,
		});
		const ownMention = BrandMention.create({
			brand: 'Patroltech',
			position: 1,
			sentiment: 'positive',
			citedUrl: 'https://patroltech.com/security',
		});
		const competitorMention = BrandMention.create({
			brand: 'Tracktik',
			position: 2,
			sentiment: 'neutral',
			citedUrl: null,
		});

		const answer = LlmAnswer.record({
			...makeBaseInput(),
			mentions: [ownMention, competitorMention],
			citations: [ownCitation],
		});

		const events = answer.pullEvents();
		expect(events).toHaveLength(1);
		const evt = events[0] as unknown as {
			type: string;
			mentionsOwnBrand: boolean;
			ownPosition: number | null;
			ownCitationCount: number;
			competitorMentionCount: number;
		};
		expect(evt.type).toBe('LlmAnswerRecorded');
		expect(evt.mentionsOwnBrand).toBe(true);
		expect(evt.ownPosition).toBe(1);
		expect(evt.ownCitationCount).toBe(1);
		expect(evt.competitorMentionCount).toBe(1);
	});

	it('treats an answer with only competitor mentions as not mentioning the own brand', () => {
		const competitorOnly = BrandMention.create({
			brand: 'Tracktik',
			position: 1,
			sentiment: 'positive',
			citedUrl: null,
		});

		const answer = LlmAnswer.record({
			...makeBaseInput(),
			mentions: [competitorOnly],
			citations: [],
		});

		const evt = answer.pullEvents()[0] as unknown as {
			mentionsOwnBrand: boolean;
			competitorMentionCount: number;
		};
		expect(evt.mentionsOwnBrand).toBe(false);
		expect(evt.competitorMentionCount).toBe(1);
	});
});
