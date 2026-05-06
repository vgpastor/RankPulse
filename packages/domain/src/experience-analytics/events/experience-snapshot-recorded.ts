import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { ClarityProjectId } from '../value-objects/identifiers.js';

export class ExperienceSnapshotRecorded implements DomainEvent {
	readonly type = 'ExperienceSnapshotRecorded';
	readonly clarityProjectId: ClarityProjectId;
	readonly projectId: ProjectId;
	readonly observedDate: string;
	readonly sessionsCount: number;
	readonly rageClicks: number;
	readonly occurredAt: Date;

	constructor(props: {
		clarityProjectId: ClarityProjectId;
		projectId: ProjectId;
		observedDate: string;
		sessionsCount: number;
		rageClicks: number;
		occurredAt: Date;
	}) {
		this.clarityProjectId = props.clarityProjectId;
		this.projectId = props.projectId;
		this.observedDate = props.observedDate;
		this.sessionsCount = props.sessionsCount;
		this.rageClicks = props.rageClicks;
		this.occurredAt = props.occurredAt;
	}
}
