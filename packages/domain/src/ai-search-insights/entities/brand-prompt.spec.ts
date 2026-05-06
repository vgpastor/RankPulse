import { Uuid } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { BrandPromptId } from '../value-objects/identifiers.js';
import { PromptKinds } from '../value-objects/prompt-kind.js';
import { PromptText } from '../value-objects/prompt-text.js';
import { BrandPrompt } from './brand-prompt.js';

const makeIds = () => ({
	id: Uuid.generate() as BrandPromptId,
	orgId: Uuid.generate() as OrganizationId,
	projectId: Uuid.generate() as ProjectId,
});

describe('BrandPrompt', () => {
	it('records a BrandPromptCreated event on register', () => {
		const { id, orgId, projectId } = makeIds();
		const prompt = BrandPrompt.register({
			id,
			organizationId: orgId,
			projectId,
			text: PromptText.create('best CRM for SaaS'),
			kind: PromptKinds.CATEGORY,
			now: new Date('2026-05-06T10:00:00Z'),
		});

		const events = prompt.pullEvents();
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe('BrandPromptCreated');
		expect(prompt.isActive()).toBe(true);
	});

	it('pause / resume toggles active state and emits the right events', () => {
		const { id, orgId, projectId } = makeIds();
		const prompt = BrandPrompt.register({
			id,
			organizationId: orgId,
			projectId,
			text: PromptText.create('best CRM for SaaS'),
			kind: PromptKinds.CATEGORY,
			now: new Date('2026-05-06T10:00:00Z'),
		});
		prompt.pullEvents();

		prompt.pause(new Date('2026-05-06T11:00:00Z'));
		expect(prompt.isActive()).toBe(false);
		expect(prompt.pullEvents().map((e) => e.type)).toEqual(['BrandPromptPaused']);

		prompt.resume(new Date('2026-05-06T12:00:00Z'));
		expect(prompt.isActive()).toBe(true);
		expect(prompt.pullEvents().map((e) => e.type)).toEqual(['BrandPromptResumed']);
	});

	it('throws when pausing twice or resuming an active prompt', () => {
		const { id, orgId, projectId } = makeIds();
		const prompt = BrandPrompt.register({
			id,
			organizationId: orgId,
			projectId,
			text: PromptText.create('best CRM for SaaS'),
			kind: PromptKinds.CATEGORY,
			now: new Date('2026-05-06T10:00:00Z'),
		});

		prompt.pause(new Date('2026-05-06T11:00:00Z'));
		expect(() => prompt.pause(new Date('2026-05-06T12:00:00Z'))).toThrow(/already paused/);

		prompt.resume(new Date('2026-05-06T12:30:00Z'));
		expect(() => prompt.resume(new Date('2026-05-06T13:00:00Z'))).toThrow(/not paused/);
	});
});
