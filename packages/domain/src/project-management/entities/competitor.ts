import { InvalidInputError } from '@rankpulse/shared';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { DomainName } from '../value-objects/domain-name.js';
import type { CompetitorId, ProjectId } from '../value-objects/identifiers.js';

export interface CompetitorProps {
	id: CompetitorId;
	projectId: ProjectId;
	domain: DomainName;
	label: string;
	createdAt: Date;
}

export class Competitor extends AggregateRoot {
	private constructor(private readonly props: CompetitorProps) {
		super();
	}

	static add(input: {
		id: CompetitorId;
		projectId: ProjectId;
		domain: DomainName;
		label?: string;
		now: Date;
	}): Competitor {
		const label = (input.label ?? input.domain.value).trim();
		if (label.length < 1) {
			throw new InvalidInputError('Competitor label cannot be empty');
		}
		return new Competitor({
			id: input.id,
			projectId: input.projectId,
			domain: input.domain,
			label,
			createdAt: input.now,
		});
	}

	static rehydrate(props: CompetitorProps): Competitor {
		return new Competitor(props);
	}

	get id(): CompetitorId {
		return this.props.id;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get domain(): DomainName {
		return this.props.domain;
	}
	get label(): string {
		return this.props.label;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
}
