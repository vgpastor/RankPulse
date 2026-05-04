import { InvalidInputError } from '@rankpulse/shared';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { OrganizationCreated } from '../events/organization-created.js';
import type { OrganizationId, UserId } from '../value-objects/identifiers.js';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export interface OrganizationProps {
	id: OrganizationId;
	name: string;
	slug: string;
	createdAt: Date;
}

export class Organization extends AggregateRoot {
	private constructor(private readonly props: OrganizationProps) {
		super();
	}

	static register(input: {
		id: OrganizationId;
		name: string;
		slug: string;
		ownerId: UserId;
		now: Date;
	}): Organization {
		const name = input.name.trim();
		if (name.length < 2) {
			throw new InvalidInputError('Organization name must be at least 2 characters');
		}
		const slug = input.slug.trim().toLowerCase();
		if (!SLUG_RE.test(slug)) {
			throw new InvalidInputError(
				`Organization slug "${input.slug}" must be lowercase alphanumeric with optional dashes`,
			);
		}

		const org = new Organization({ id: input.id, name, slug, createdAt: input.now });
		org.record(
			new OrganizationCreated({
				organizationId: input.id,
				ownerId: input.ownerId,
				slug,
				occurredAt: input.now,
			}),
		);
		return org;
	}

	static rehydrate(props: OrganizationProps): Organization {
		return new Organization(props);
	}

	get id(): OrganizationId {
		return this.props.id;
	}
	get name(): string {
		return this.props.name;
	}
	get slug(): string {
		return this.props.slug;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
}
