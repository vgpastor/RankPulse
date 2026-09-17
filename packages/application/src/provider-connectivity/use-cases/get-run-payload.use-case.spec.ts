import { ProviderConnectivity } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';
import { describe, expect, it } from 'vitest';
import { GetRunPayloadUseCase } from './get-run-payload.use-case.js';

const DEF_ID = 'def-1' as ProviderConnectivity.ProviderJobDefinitionId;
const RUN_ID = 'run-1' as ProviderConnectivity.ProviderJobRunId;
const PAYLOAD_ID = 'payload-1' as ProviderConnectivity.RawPayloadId;
const CRED_ID = 'cred-1' as ProviderConnectivity.ProviderCredentialId;

const PARAMS = { keyword: 'control de rondas', locationCode: 2724, languageCode: 'es' };

const buildRun = (opts: { rawPayloadId?: ProviderConnectivity.RawPayloadId; startedAt?: Date } = {}) => {
	const run = ProviderConnectivity.ProviderJobRun.start({
		id: RUN_ID,
		definitionId: DEF_ID,
		credentialId: CRED_ID,
		now: opts.startedAt ?? new Date('2026-09-17T10:00:00Z'),
	});
	if (opts.rawPayloadId) run.complete(opts.rawPayloadId, new Date('2026-09-17T10:00:30Z'));
	return run;
};

const buildPayload = (fetchedAt: Date) =>
	ProviderConnectivity.RawPayload.store({
		id: PAYLOAD_ID,
		providerId: ProviderConnectivity.ProviderId.create('dataforseo'),
		endpointId: ProviderConnectivity.EndpointId.create('serp-google-organic-live'),
		params: PARAMS,
		dateBucket: '2026-09-17',
		payload: { tasks: [{ status_code: 20000 }] },
		now: fetchedAt,
	});

const repos = (
	run: ProviderConnectivity.ProviderJobRun | null,
	payload: ProviderConnectivity.RawPayload | null,
) => {
	const runs = {
		save: async () => {},
		findById: async () => run,
		listForDefinition: async () => [],
	} satisfies ProviderConnectivity.JobRunRepository;
	const payloads = {
		save: async () => {},
		findByRequestHash: async () => null,
		findById: async () => payload,
	} satisfies ProviderConnectivity.RawPayloadRepository;
	return new GetRunPayloadUseCase(runs, payloads);
};

describe('GetRunPayloadUseCase', () => {
	it('returns what was asked and what came back', async () => {
		const run = buildRun({ rawPayloadId: PAYLOAD_ID });
		const payload = buildPayload(new Date('2026-09-17T10:00:20Z'));

		const view = await repos(run, payload).execute({ definitionId: DEF_ID, runId: RUN_ID });

		expect(view.status).toBe('succeeded');
		expect(view.payload?.requestParams).toEqual(PARAMS);
		expect(view.payload?.response).toEqual({ tasks: [{ status_code: 20000 }] });
		expect(view.payload?.requestHash).toHaveLength(64);
	});

	it('flags a payload that an earlier run had already fetched', async () => {
		// Fan-out sibling: the payload predates this run, so the charge
		// belongs to whoever fetched it first.
		const run = buildRun({ rawPayloadId: PAYLOAD_ID, startedAt: new Date('2026-09-17T10:00:00Z') });
		const payload = buildPayload(new Date('2026-09-17T06:00:00Z'));

		const view = await repos(run, payload).execute({ definitionId: DEF_ID, runId: RUN_ID });

		expect(view.payload?.reusedFromEarlierRun).toBe(true);
	});

	it('does not flag reuse when the run fetched the payload itself', async () => {
		const run = buildRun({ rawPayloadId: PAYLOAD_ID, startedAt: new Date('2026-09-17T10:00:00Z') });
		const payload = buildPayload(new Date('2026-09-17T10:00:20Z'));

		const view = await repos(run, payload).execute({ definitionId: DEF_ID, runId: RUN_ID });

		expect(view.payload?.reusedFromEarlierRun).toBe(false);
	});

	it('returns the run with a null payload when none was stored', async () => {
		const view = await repos(buildRun(), null).execute({ definitionId: DEF_ID, runId: RUN_ID });

		expect(view.status).toBe('running');
		expect(view.payload).toBeNull();
	});

	it('returns a null payload when the referenced row is gone', async () => {
		// Retention sweep or manual delete: report the run, invent nothing.
		const view = await repos(buildRun({ rawPayloadId: PAYLOAD_ID }), null).execute({
			definitionId: DEF_ID,
			runId: RUN_ID,
		});

		expect(view.payload).toBeNull();
	});

	it('rejects a run that belongs to another definition', async () => {
		const foreign = ProviderConnectivity.ProviderJobRun.start({
			id: RUN_ID,
			definitionId: 'other-def' as ProviderConnectivity.ProviderJobDefinitionId,
			credentialId: CRED_ID,
			now: new Date('2026-09-17T10:00:00Z'),
		});

		await expect(repos(foreign, null).execute({ definitionId: DEF_ID, runId: RUN_ID })).rejects.toThrow(
			NotFoundError,
		);
	});

	it('rejects an unknown run', async () => {
		await expect(repos(null, null).execute({ definitionId: DEF_ID, runId: RUN_ID })).rejects.toThrow(
			NotFoundError,
		);
	});
});
