import { InvalidInputError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { PortfolioId } from '../value-objects/identifiers.js';

export interface PortfolioProps {
	id: PortfolioId;
	organizationId: OrganizationId;
	name: string;
	createdAt: Date;
}

export class Portfolio extends AggregateRoot {
	private constructor(private readonly props: PortfolioProps) {
		super();
	}

	static create(input: {
		id: PortfolioId;
		organizationId: OrganizationId;
		name: string;
		now: Date;
	}): Portfolio {
		const name = input.name.trim();
		if (name.length < 2) {
			throw new InvalidInputError('Portfolio name must be at least 2 characters');
		}
		return new Portfolio({
			id: input.id,
			organizationId: input.organizationId,
			name,
			createdAt: input.now,
		});
	}

	static rehydrate(props: PortfolioProps): Portfolio {
		return new Portfolio(props);
	}

	get id(): PortfolioId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get name(): string {
		return this.props.name;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
}
