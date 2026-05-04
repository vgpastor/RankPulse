import { InvalidInputError } from '@rankpulse/shared';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { ApiTokenId, OrganizationId, UserId } from '../value-objects/identifiers.js';

export interface ApiTokenProps {
	id: ApiTokenId;
	organizationId: OrganizationId;
	createdBy: UserId;
	name: string;
	hashedToken: string;
	scopes: readonly string[];
	expiresAt: Date | null;
	createdAt: Date;
	revokedAt: Date | null;
}

export class ApiToken extends AggregateRoot {
	private constructor(private props: ApiTokenProps) {
		super();
	}

	static issue(input: {
		id: ApiTokenId;
		organizationId: OrganizationId;
		createdBy: UserId;
		name: string;
		hashedToken: string;
		scopes: readonly string[];
		expiresAt: Date | null;
		now: Date;
	}): ApiToken {
		const name = input.name.trim();
		if (!name) {
			throw new InvalidInputError('API token name cannot be empty');
		}
		if (input.expiresAt && input.expiresAt.getTime() <= input.now.getTime()) {
			throw new InvalidInputError('API token expiration must be in the future');
		}
		return new ApiToken({
			id: input.id,
			organizationId: input.organizationId,
			createdBy: input.createdBy,
			name,
			hashedToken: input.hashedToken,
			scopes: [...input.scopes],
			expiresAt: input.expiresAt,
			createdAt: input.now,
			revokedAt: null,
		});
	}

	static rehydrate(props: ApiTokenProps): ApiToken {
		return new ApiToken(props);
	}

	revoke(now: Date): void {
		if (this.props.revokedAt) return;
		this.props = { ...this.props, revokedAt: now };
	}

	isUsable(at: Date): boolean {
		if (this.props.revokedAt) return false;
		if (this.props.expiresAt && this.props.expiresAt.getTime() <= at.getTime()) return false;
		return true;
	}

	get id(): ApiTokenId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get createdBy(): UserId {
		return this.props.createdBy;
	}
	get name(): string {
		return this.props.name;
	}
	get hashedToken(): string {
		return this.props.hashedToken;
	}
	get scopes(): readonly string[] {
		return this.props.scopes;
	}
	get expiresAt(): Date | null {
		return this.props.expiresAt;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
	get revokedAt(): Date | null {
		return this.props.revokedAt;
	}
}
