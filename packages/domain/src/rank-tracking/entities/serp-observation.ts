import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { Device } from '../value-objects/device.js';
import type { SerpObservationId } from '../value-objects/identifiers.js';
import type { SerpResult } from '../value-objects/serp-result.js';

export interface SerpObservationProps {
	id: SerpObservationId;
	projectId: ProjectId;
	phrase: string;
	country: string;
	language: string;
	device: Device;
	results: readonly SerpResult[];
	sourceProvider: string;
	rawPayloadId: string | null;
	observedAt: Date;
}

/**
 * One immutable snapshot of a SERP for a (project, keyword, location, device)
 * tuple. The aggregate owns the full top-N row collection so the read model
 * can answer "what's the latest top-10 for this keyword?" without decoding
 * the original DataForSEO payload from raw_payloads.
 *
 * `observedAt` is normalised to start-of-day-UTC at construction so re-running
 * the same SERP fetch later in the day overwrites yesterday's snapshot
 * idempotently — required by the issue's acceptance criteria
 * (project_id, keyword, location, observed_at::date) is the natural key.
 */
export class SerpObservation extends AggregateRoot {
	private constructor(private readonly props: SerpObservationProps) {
		super();
	}

	static record(input: {
		id: SerpObservationId;
		projectId: ProjectId;
		phrase: string;
		country: string;
		language: string;
		device: Device;
		results: readonly SerpResult[];
		sourceProvider: string;
		rawPayloadId: string | null;
		now: Date;
	}): SerpObservation {
		const dedupedByRank = new Map<number, SerpResult>();
		for (const r of input.results) {
			if (!dedupedByRank.has(r.rank)) dedupedByRank.set(r.rank, r);
		}
		const sorted = [...dedupedByRank.values()].sort((a, b) => a.rank - b.rank);
		return new SerpObservation({
			id: input.id,
			projectId: input.projectId,
			phrase: input.phrase,
			country: input.country,
			language: input.language,
			device: input.device,
			results: sorted,
			sourceProvider: input.sourceProvider,
			rawPayloadId: input.rawPayloadId,
			observedAt: SerpObservation.startOfDayUtc(input.now),
		});
	}

	static rehydrate(props: SerpObservationProps): SerpObservation {
		return new SerpObservation({ ...props, results: [...props.results] });
	}

	private static startOfDayUtc(d: Date): Date {
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	}

	get id(): SerpObservationId {
		return this.props.id;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get phrase(): string {
		return this.props.phrase;
	}
	get country(): string {
		return this.props.country;
	}
	get language(): string {
		return this.props.language;
	}
	get device(): Device {
		return this.props.device;
	}
	get results(): readonly SerpResult[] {
		return this.props.results;
	}
	get sourceProvider(): string {
		return this.props.sourceProvider;
	}
	get rawPayloadId(): string | null {
		return this.props.rawPayloadId;
	}
	get observedAt(): Date {
		return this.props.observedAt;
	}
}
