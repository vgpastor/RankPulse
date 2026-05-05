import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { Ga4PropertyId } from '../value-objects/identifiers.js';

/**
 * One event per ingest call, never per row. A `runReport` with rowLimit
 * 10 000 should not fan-out 10 000 publisher calls — subscribers already
 * aggregate downstream. Mirrors the GSC pattern.
 */
export class Ga4BatchIngested implements DomainEvent {
	readonly type = 'Ga4BatchIngested';
	readonly projectId: ProjectId;
	readonly ga4PropertyId: Ga4PropertyId;
	readonly rowsCount: number;
	readonly totalSessions: number;
	readonly totalUsers: number;
	readonly occurredAt: Date;

	constructor(props: {
		projectId: ProjectId;
		ga4PropertyId: Ga4PropertyId;
		rowsCount: number;
		totalSessions: number;
		totalUsers: number;
		occurredAt: Date;
	}) {
		this.projectId = props.projectId;
		this.ga4PropertyId = props.ga4PropertyId;
		this.rowsCount = props.rowsCount;
		this.totalSessions = props.totalSessions;
		this.totalUsers = props.totalUsers;
		this.occurredAt = props.occurredAt;
	}
}
