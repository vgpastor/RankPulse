import type { Uuid } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import type { DomainAuthorityObservationId, ProjectId } from '../value-objects/identifiers.js';
import { DomainAuthorityObservation } from './domain-authority-observation.js';

const ID = '00000000-0000-0000-0000-000000000001' as Uuid as DomainAuthorityObservationId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectId;
const metrics = {
	totalBacklinks: 2023,
	referringDomains: 95,
	referringMainDomains: 93,
	referringPages: 1800,
	brokenBacklinks: 4,
	spamScore: 3,
	rank: 271,
};

describe('DomainAuthorityObservation.record', () => {
	it('keeps the project, its domain and the metrics as given', () => {
		const o = DomainAuthorityObservation.record({
			id: ID,
			projectId: PROJECT_ID,
			domain: 'patroltech.online',
			metrics,
			rawPayloadId: null,
			now: new Date('2026-09-19T10:20:51Z'),
		});
		expect(o.projectId).toBe(PROJECT_ID);
		expect(o.domain).toBe('patroltech.online');
		expect(o.metrics).toEqual(metrics);
	});

	// One row per project per day is the idempotency key; two fetches on the
	// same day must collapse onto the same observedAt.
	it('truncates observedAt to the start of the UTC day', () => {
		const o = DomainAuthorityObservation.record({
			id: ID,
			projectId: PROJECT_ID,
			domain: 'patroltech.online',
			metrics,
			rawPayloadId: null,
			now: new Date('2026-09-19T23:59:59.999Z'),
		});
		expect(o.observedAt.toISOString()).toBe('2026-09-19T00:00:00.000Z');
	});
});
