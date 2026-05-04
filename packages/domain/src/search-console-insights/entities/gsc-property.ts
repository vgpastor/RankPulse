import { ConflictError, InvalidInputError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import type { ProjectId } from '../../project-management/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { GscPropertyLinked } from '../events/gsc-property-linked.js';
import type { GscPropertyId } from '../value-objects/identifiers.js';
import type { GscPropertyType } from '../value-objects/property-type.js';

export interface GscPropertyProps {
	id: GscPropertyId;
	organizationId: OrganizationId;
	projectId: ProjectId;
	siteUrl: string;
	propertyType: GscPropertyType;
	credentialId: string | null;
	linkedAt: Date;
	unlinkedAt: Date | null;
}

/**
 * A GSC property (URL-prefix or domain-property) linked to a RankPulse
 * project. The credential id is captured so that subsequent fetches use the
 * same Google account/service-account used at link time, even if the cascade
 * resolution would pick something else. Set `credentialId` to null to fall
 * back to the cascade.
 */
export class GscProperty extends AggregateRoot {
	private constructor(private props: GscPropertyProps) {
		super();
	}

	static link(input: {
		id: GscPropertyId;
		organizationId: OrganizationId;
		projectId: ProjectId;
		siteUrl: string;
		propertyType: GscPropertyType;
		credentialId: string | null;
		now: Date;
	}): GscProperty {
		const siteUrl = input.siteUrl.trim();
		if (siteUrl.length === 0) {
			throw new InvalidInputError('siteUrl cannot be empty');
		}
		if (input.propertyType === 'URL_PREFIX' && !/^https?:\/\//.test(siteUrl)) {
			throw new InvalidInputError('URL_PREFIX siteUrl must include http(s)://');
		}
		if (input.propertyType === 'DOMAIN' && !siteUrl.startsWith('sc-domain:')) {
			throw new InvalidInputError('DOMAIN siteUrl must start with "sc-domain:"');
		}
		const property = new GscProperty({
			id: input.id,
			organizationId: input.organizationId,
			projectId: input.projectId,
			siteUrl,
			propertyType: input.propertyType,
			credentialId: input.credentialId,
			linkedAt: input.now,
			unlinkedAt: null,
		});
		property.record(
			new GscPropertyLinked({
				gscPropertyId: input.id,
				projectId: input.projectId,
				siteUrl,
				propertyType: input.propertyType,
				occurredAt: input.now,
			}),
		);
		return property;
	}

	static rehydrate(props: GscPropertyProps): GscProperty {
		return new GscProperty(props);
	}

	unlink(now: Date): void {
		if (this.props.unlinkedAt) {
			throw new ConflictError('GscProperty is already unlinked');
		}
		this.props = { ...this.props, unlinkedAt: now };
	}

	isActive(): boolean {
		return this.props.unlinkedAt === null;
	}

	get id(): GscPropertyId {
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
	get propertyType(): GscPropertyType {
		return this.props.propertyType;
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
