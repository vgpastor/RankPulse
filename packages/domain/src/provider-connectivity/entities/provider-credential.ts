import { InvalidInputError } from '@rankpulse/shared';
import type { OrganizationId } from '../../identity-access/value-objects/identifiers.js';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { ProviderCredentialRegistered } from '../events/provider-credential-registered.js';
import { ProviderCredentialRevoked } from '../events/provider-credential-revoked.js';
import type { CredentialScope } from '../value-objects/credential-scope.js';
import type { EncryptedSecret } from '../value-objects/encrypted-secret.js';
import type { ProviderCredentialId } from '../value-objects/identifiers.js';
import type { ProviderId } from '../value-objects/provider-id.js';

export interface ProviderCredentialProps {
	id: ProviderCredentialId;
	organizationId: OrganizationId;
	providerId: ProviderId;
	scope: CredentialScope;
	label: string;
	encryptedSecret: EncryptedSecret;
	expiresAt: Date | null;
	revokedAt: Date | null;
	createdAt: Date;
}

/**
 * Stored credential bound to a scope (org / portfolio / project / domain).
 * Multiple credentials for the same provider can coexist in different scopes;
 * the {@link CredentialResolver} (application layer) picks the most specific
 * matching one at fetch time.
 */
export class ProviderCredential extends AggregateRoot {
	private constructor(private props: ProviderCredentialProps) {
		super();
	}

	static register(input: {
		id: ProviderCredentialId;
		organizationId: OrganizationId;
		providerId: ProviderId;
		scope: CredentialScope;
		label: string;
		encryptedSecret: EncryptedSecret;
		expiresAt?: Date | null;
		now: Date;
	}): ProviderCredential {
		const label = input.label.trim();
		if (label.length < 1) {
			throw new InvalidInputError('Credential label cannot be empty');
		}
		if (input.expiresAt && input.expiresAt.getTime() <= input.now.getTime()) {
			throw new InvalidInputError('Credential expiresAt must be in the future');
		}
		const cred = new ProviderCredential({
			id: input.id,
			organizationId: input.organizationId,
			providerId: input.providerId,
			scope: input.scope,
			label,
			encryptedSecret: input.encryptedSecret,
			expiresAt: input.expiresAt ?? null,
			revokedAt: null,
			createdAt: input.now,
		});
		cred.record(
			new ProviderCredentialRegistered({
				credentialId: input.id,
				organizationId: input.organizationId,
				providerId: input.providerId.value,
				scope: { type: input.scope.type, id: input.scope.id },
				occurredAt: input.now,
			}),
		);
		return cred;
	}

	static rehydrate(props: ProviderCredentialProps): ProviderCredential {
		return new ProviderCredential(props);
	}

	revoke(now: Date): void {
		if (this.props.revokedAt) return;
		this.props = { ...this.props, revokedAt: now };
		this.record(
			new ProviderCredentialRevoked({
				credentialId: this.props.id,
				organizationId: this.props.organizationId,
				providerId: this.props.providerId.value,
				occurredAt: now,
			}),
		);
	}

	rotate(secret: EncryptedSecret, now: Date, expiresAt: Date | null = null): void {
		if (this.props.revokedAt) {
			throw new InvalidInputError('Cannot rotate a revoked credential');
		}
		if (expiresAt && expiresAt.getTime() <= now.getTime()) {
			throw new InvalidInputError('Credential expiresAt must be in the future');
		}
		this.props = { ...this.props, encryptedSecret: secret, expiresAt };
	}

	isUsable(at: Date): boolean {
		if (this.props.revokedAt) return false;
		if (this.props.expiresAt && this.props.expiresAt.getTime() <= at.getTime()) return false;
		return true;
	}

	get id(): ProviderCredentialId {
		return this.props.id;
	}
	get organizationId(): OrganizationId {
		return this.props.organizationId;
	}
	get providerId(): ProviderId {
		return this.props.providerId;
	}
	get scope(): CredentialScope {
		return this.props.scope;
	}
	get label(): string {
		return this.props.label;
	}
	get encryptedSecret(): EncryptedSecret {
		return this.props.encryptedSecret;
	}
	get expiresAt(): Date | null {
		return this.props.expiresAt;
	}
	get revokedAt(): Date | null {
		return this.props.revokedAt;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
}
