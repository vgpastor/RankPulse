import type { ProviderConnectivity } from '@rankpulse/domain';
import { NotFoundError } from '@rankpulse/shared';

export interface RunPayloadView {
	runId: string;
	definitionId: string;
	status: ProviderConnectivity.JobRunStatus;
	startedAt: string;
	finishedAt: string | null;
	error: ProviderConnectivity.JobRunError | null;
	/** Null when the run stored no payload, or the row is already gone. */
	payload: StoredPayloadView | null;
}

export interface StoredPayloadView {
	id: string;
	providerId: string;
	endpointId: string;
	requestHash: string;
	/** Null for payloads written before migration 0022. */
	requestParams: Record<string, unknown> | null;
	response: unknown;
	payloadSize: number;
	fetchedAt: string;
	/** See {@link wasFetchedByAnEarlierRun}. */
	reusedFromEarlierRun: boolean;
}

export interface GetRunPayloadCommand {
	definitionId: string;
	runId: string;
}

/**
 * A payload older than the run pointing at it was fetched by an earlier run and
 * replayed into this one — the upstream call, and its charge, belong to that
 * first run. This is what a deduplicated fan-out sibling looks like: several
 * runs reporting `succeeded` off a single billed request.
 */
const wasFetchedByAnEarlierRun = (
	payload: ProviderConnectivity.RawPayload,
	run: ProviderConnectivity.ProviderJobRun,
): boolean => payload.fetchedAt < run.startedAt;

const toPayloadView = (
	payload: ProviderConnectivity.RawPayload,
	run: ProviderConnectivity.ProviderJobRun,
): StoredPayloadView => ({
	id: payload.id,
	providerId: payload.providerId.value,
	endpointId: payload.endpointId.value,
	requestHash: payload.requestHash,
	requestParams: payload.requestParams,
	response: payload.payload,
	payloadSize: payload.payloadSize,
	fetchedAt: payload.fetchedAt.toISOString(),
	reusedFromEarlierRun: wasFetchedByAnEarlierRun(payload, run),
});

const toView = (
	run: ProviderConnectivity.ProviderJobRun,
	payload: ProviderConnectivity.RawPayload | null,
): RunPayloadView => ({
	runId: run.id,
	definitionId: run.definitionId,
	status: run.status,
	startedAt: run.startedAt.toISOString(),
	finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
	error: run.error,
	payload: payload ? toPayloadView(payload, run) : null,
});

/**
 * Returns what a run asked upstream and what came back.
 *
 * Provider responses were already persisted so a changed normalizer could
 * re-process them, but nothing exposed them: an operator could see that a run
 * succeeded and not what it fetched. Reading the payload back answers the
 * question that comes up whenever a number looks wrong — did the provider
 * return this, or did our ACL mangle it? — without paying for the call again.
 */
export class GetRunPayloadUseCase {
	constructor(
		private readonly runs: ProviderConnectivity.JobRunRepository,
		private readonly payloads: ProviderConnectivity.RawPayloadRepository,
	) {}

	async execute(cmd: GetRunPayloadCommand): Promise<RunPayloadView> {
		const run = await this.loadRunOfDefinition(cmd);
		// A run that stores no payload id never had one; one whose row is gone
		// (retention sweep, manual delete) reads the same. Both surface the run
		// with `payload: null` rather than failing — the run itself is still
		// the answer to "did this execute, and did it error?".
		const payload = run.rawPayloadId ? await this.payloads.findById(run.rawPayloadId) : null;
		return toView(run, payload);
	}

	/**
	 * Scoping the lookup to the definition keeps the route's authorization
	 * meaningful: the caller is authorized against the definition, so a run
	 * belonging to a different one must read as absent rather than leak.
	 */
	private async loadRunOfDefinition(cmd: GetRunPayloadCommand): Promise<ProviderConnectivity.ProviderJobRun> {
		const run = await this.runs.findById(cmd.runId as ProviderConnectivity.ProviderJobRunId);
		if (!run || run.definitionId !== cmd.definitionId) {
			throw new NotFoundError(`Run ${cmd.runId} not found for definition ${cmd.definitionId}`);
		}
		return run;
	}
}
