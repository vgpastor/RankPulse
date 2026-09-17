import type { ProviderConnectivity } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface RunPayloadView {
	runId: string;
	definitionId: string;
	status: ProviderConnectivity.JobRunStatus;
	startedAt: string;
	finishedAt: string | null;
	error: ProviderConnectivity.JobRunError | null;
	/** Null when the run failed before a payload was stored. */
	payload: {
		id: string;
		providerId: string;
		endpointId: string;
		requestHash: string;
		/** Null for payloads written before migration 0022. */
		requestParams: Record<string, unknown> | null;
		response: unknown;
		payloadSize: number;
		fetchedAt: string;
		/**
		 * True when this payload was fetched by an earlier run and replayed
		 * into this one. The upstream call — and its charge — happened once,
		 * on the run whose id matches `payload.id`'s original fetch.
		 */
		reusedFromEarlierRun: boolean;
	} | null;
}

export interface GetRunPayloadCommand {
	definitionId: string;
	runId: string;
}

/**
 * Returns what a run asked upstream and what came back.
 *
 * Provider responses were already persisted for re-processing, but nothing
 * exposed them: an operator could see that a run succeeded and not what it
 * fetched. Reading the payload back answers the two questions that come up
 * when a number looks wrong — did the provider return this, or did our ACL
 * mangle it? — without paying for the call again.
 */
export class GetRunPayloadUseCase {
	constructor(
		private readonly runs: ProviderConnectivity.JobRunRepository,
		private readonly payloads: ProviderConnectivity.RawPayloadRepository,
	) {}

	async execute(cmd: GetRunPayloadCommand): Promise<RunPayloadView> {
		const run = await this.runs.findById(cmd.runId as ProviderConnectivity.ProviderJobRunId);
		if (!run || run.definitionId !== cmd.definitionId) {
			throw new NotFoundError(`Run ${cmd.runId} not found for definition ${cmd.definitionId}`);
		}

		const base = {
			runId: run.id as string,
			definitionId: run.definitionId as string,
			status: run.status,
			startedAt: run.startedAt.toISOString(),
			finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
			error: run.error,
		};

		if (!run.rawPayloadId) {
			return { ...base, payload: null };
		}

		const payload = await this.payloads.findById(run.rawPayloadId);
		if (!payload) {
			// The run references a payload that no longer exists (retention
			// sweep, manual delete). Report the run without inventing data.
			return { ...base, payload: null };
		}

		return {
			...base,
			payload: {
				id: payload.id as string,
				providerId: payload.providerId.value,
				endpointId: payload.endpointId.value,
				requestHash: payload.requestHash,
				requestParams: payload.requestParams,
				response: payload.payload,
				payloadSize: payload.payloadSize,
				fetchedAt: payload.fetchedAt.toISOString(),
				reusedFromEarlierRun: payload.fetchedAt < run.startedAt,
			},
		};
	}
}
