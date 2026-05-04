import { ConflictError } from '@rankpulse/shared';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type {
	ProviderCredentialId,
	ProviderJobDefinitionId,
	ProviderJobRunId,
	RawPayloadId,
} from '../value-objects/identifiers.js';

export const JobRunStatuses = {
	RUNNING: 'running',
	SUCCEEDED: 'succeeded',
	FAILED: 'failed',
	SKIPPED: 'skipped',
} as const;
export type JobRunStatus = (typeof JobRunStatuses)[keyof typeof JobRunStatuses];

export interface JobRunError {
	code: string;
	message: string;
	retryable: boolean;
}

export interface ProviderJobRunProps {
	id: ProviderJobRunId;
	definitionId: ProviderJobDefinitionId;
	credentialId: ProviderCredentialId | null;
	status: JobRunStatus;
	startedAt: Date;
	finishedAt: Date | null;
	rawPayloadId: RawPayloadId | null;
	error: JobRunError | null;
}

/** Per-execution record of a {@link ProviderJobDefinition}. Append-only audit trail. */
export class ProviderJobRun extends AggregateRoot {
	private constructor(private props: ProviderJobRunProps) {
		super();
	}

	static start(input: {
		id: ProviderJobRunId;
		definitionId: ProviderJobDefinitionId;
		credentialId: ProviderCredentialId | null;
		now: Date;
	}): ProviderJobRun {
		return new ProviderJobRun({
			id: input.id,
			definitionId: input.definitionId,
			credentialId: input.credentialId,
			status: JobRunStatuses.RUNNING,
			startedAt: input.now,
			finishedAt: null,
			rawPayloadId: null,
			error: null,
		});
	}

	static rehydrate(props: ProviderJobRunProps): ProviderJobRun {
		return new ProviderJobRun(props);
	}

	complete(rawPayloadId: RawPayloadId, now: Date): void {
		if (this.props.status !== JobRunStatuses.RUNNING) {
			throw new ConflictError(`Cannot complete a job run in status "${this.props.status}"`);
		}
		this.props = {
			...this.props,
			status: JobRunStatuses.SUCCEEDED,
			finishedAt: now,
			rawPayloadId,
		};
	}

	fail(error: JobRunError, now: Date): void {
		if (this.props.status !== JobRunStatuses.RUNNING) {
			throw new ConflictError(`Cannot fail a job run in status "${this.props.status}"`);
		}
		this.props = { ...this.props, status: JobRunStatuses.FAILED, finishedAt: now, error };
	}

	skip(reason: string, now: Date): void {
		if (this.props.status !== JobRunStatuses.RUNNING) {
			throw new ConflictError(`Cannot skip a job run in status "${this.props.status}"`);
		}
		this.props = {
			...this.props,
			status: JobRunStatuses.SKIPPED,
			finishedAt: now,
			error: { code: 'SKIPPED', message: reason, retryable: false },
		};
	}

	get id(): ProviderJobRunId {
		return this.props.id;
	}
	get definitionId(): ProviderJobDefinitionId {
		return this.props.definitionId;
	}
	get credentialId(): ProviderCredentialId | null {
		return this.props.credentialId;
	}
	get status(): JobRunStatus {
		return this.props.status;
	}
	get startedAt(): Date {
		return this.props.startedAt;
	}
	get finishedAt(): Date | null {
		return this.props.finishedAt;
	}
	get rawPayloadId(): RawPayloadId | null {
		return this.props.rawPayloadId;
	}
	get error(): JobRunError | null {
		return this.props.error;
	}
}
