import { ConflictError, InvalidInputError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { BingPropertyLinked } from '../events/bing-property-linked.js';
import type { BingPropertyId } from '../value-objects/identifiers.js';

export interface BingPropertyProps {
	id: BingPropertyId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	siteUrl: string;
	credentialId: string | null;
	linkedAt: Date;
	unlinkedAt: Date | null;
}

/**
 * A Bing-verified property linked to a RankPulse project. Bing only accepts
 * absolute http(s) URLs (no domain-property analogue like GSC), so the
 * factory enforces that strictly.
 */
export class BingProperty extends AggregateRoot {
	private constructor(private props: BingPropertyProps) {
		super();
	}

	static link(input: {
		id: BingPropertyId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		siteUrl: string;
		credentialId: string | null;
		now: Date;
	}): BingProperty {
		const siteUrl = input.siteUrl.trim();
		if (siteUrl.length === 0) {
			throw new InvalidInputError('siteUrl cannot be empty');
		}
		if (!/^https?:\/\//.test(siteUrl)) {
			throw new InvalidInputError('Bing siteUrl must include http(s)://');
		}
		const property = new BingProperty({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			siteUrl,
			credentialId: input.credentialId,
			linkedAt: input.now,
			unlinkedAt: null,
		});
		property.record(
			new BingPropertyLinked({
				bingPropertyId: input.id,
				projectId: input.projectId,
				organizationId: input.organizationId,
				siteUrl,
				occurredAt: input.now,
			}),
		);
		return property;
	}

	static rehydrate(props: BingPropertyProps): BingProperty {
		return new BingProperty(props);
	}

	unlink(now: Date): void {
		if (this.props.unlinkedAt) {
			throw new ConflictError('BingProperty is already unlinked');
		}
		this.props = { ...this.props, unlinkedAt: now };
	}

	isActive(): boolean {
		return this.props.unlinkedAt === null;
	}

	get id(): BingPropertyId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get projectId(): ProjectId {
		return this.props.projectId;
	}
	get siteUrl(): string {
		return this.props.siteUrl;
	}
	get credentialId(): string | null {
		return this.props.credentialId;
	}
	get linkedAt(): Date {
		return this.props.linkedAt;
	}
	get unlinkedAt(): Date | null {
		return this.props.unlinkedAt;
	}
}
