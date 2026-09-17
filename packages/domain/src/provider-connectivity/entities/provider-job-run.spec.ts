import { ConflictError } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import type {
	ProviderCredentialId,
	ProviderJobDefinitionId,
	ProviderJobRunId,
	RawPayloadId,
} from '../value-objects/identifiers.js';
import { ProviderJobRun } from './provider-job-run.js';

const start = () =>
	ProviderJobRun.start({
		id: 'run-1' as ProviderJobRunId,
		definitionId: 'def-1' as ProviderJobDefinitionId,
		credentialId: 'cred-1' as ProviderCredentialId,
		now: new Date('2026-09-17T10:00:00Z'),
	});

const PAYLOAD = 'payload-1' as RawPayloadId;
const LATER = new Date('2026-09-17T10:00:30Z');

describe('ProviderJobRun', () => {
	it('starts as a billed run until told otherwise', () => {
		expect(start().cacheHit).toBe(false);
	});

	it('marks a fetched run as billed', () => {
		const run = start();
		run.complete(PAYLOAD, LATER);

		expect(run.status).toBe('succeeded');
		expect(run.cacheHit).toBe(false);
		expect(run.rawPayloadId).toBe(PAYLOAD);
	});

	it('marks a replayed run as a cache hit', () => {
		// Same outcome as `complete` — succeeded, with a payload — but this one
		// cost nothing, and the usage ledger has to be able to tell them apart.
		const run = start();
		run.completeFromCache(PAYLOAD, LATER);

		expect(run.status).toBe('succeeded');
		expect(run.cacheHit).toBe(true);
		expect(run.rawPayloadId).toBe(PAYLOAD);
	});

	it('refuses to complete a run that already finished', () => {
		const run = start();
		run.complete(PAYLOAD, LATER);

		expect(() => run.complete(PAYLOAD, LATER)).toThrow(ConflictError);
		expect(() => run.completeFromCache(PAYLOAD, LATER)).toThrow(ConflictError);
	});

	it('refuses to complete a failed run', () => {
		const run = start();
		run.fail({ code: 'BOOM', message: 'upstream down', retryable: true }, LATER);

		expect(() => run.completeFromCache(PAYLOAD, LATER)).toThrow(ConflictError);
	});

	it('keeps a failed run unbilled and payloadless', () => {
		const run = start();
		run.fail({ code: 'QUOTA_EXCEEDED', message: 'no credit', retryable: false }, LATER);

		expect(run.status).toBe('failed');
		expect(run.cacheHit).toBe(false);
		expect(run.rawPayloadId).toBeNull();
	});
});
