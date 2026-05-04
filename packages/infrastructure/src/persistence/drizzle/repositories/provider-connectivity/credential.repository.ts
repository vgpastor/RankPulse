import { type IdentityAccess, ProviderConnectivity } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { providerCredentials } from '../../schema/index.js';

export class DrizzleCredentialRepository implements ProviderConnectivity.CredentialRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(c: ProviderConnectivity.ProviderCredential): Promise<void> {
		await this.db
			.insert(providerCredentials)
			.values({
				id: c.id,
				organizationId: c.organizationId,
				providerId: c.providerId.value,
				scopeType: c.scope.type,
				scopeId: c.scope.id,
				label: c.label,
				ciphertext: c.encryptedSecret.ciphertext,
				nonce: c.encryptedSecret.nonce,
				lastFour: c.encryptedSecret.lastFour,
				expiresAt: c.expiresAt,
				revokedAt: c.revokedAt,
				createdAt: c.createdAt,
			})
			.onConflictDoUpdate({
				target: providerCredentials.id,
				set: {
					label: c.label,
					ciphertext: c.encryptedSecret.ciphertext,
					nonce: c.encryptedSecret.nonce,
					lastFour: c.encryptedSecret.lastFour,
					expiresAt: c.expiresAt,
					revokedAt: c.revokedAt,
				},
			});
	}

	async findById(
		id: ProviderConnectivity.ProviderCredentialId,
	): Promise<ProviderConnectivity.ProviderCredential | null> {
		const [row] = await this.db
			.select()
			.from(providerCredentials)
			.where(eq(providerCredentials.id, id))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProvider(
		orgId: IdentityAccess.OrganizationId,
		providerId: ProviderConnectivity.ProviderId,
	): Promise<readonly ProviderConnectivity.ProviderCredential[]> {
		const rows = await this.db
			.select()
			.from(providerCredentials)
			.where(
				and(
					eq(providerCredentials.organizationId, orgId),
					eq(providerCredentials.providerId, providerId.value),
				),
			);
		return rows.map((r) => this.toAggregate(r));
	}

	async findByScope(
		orgId: IdentityAccess.OrganizationId,
		providerId: ProviderConnectivity.ProviderId,
		scope: ProviderConnectivity.CredentialScope,
		label: string,
	): Promise<ProviderConnectivity.ProviderCredential | null> {
		const [row] = await this.db
			.select()
			.from(providerCredentials)
			.where(
				and(
					eq(providerCredentials.organizationId, orgId),
					eq(providerCredentials.providerId, providerId.value),
					eq(providerCredentials.scopeType, scope.type),
					eq(providerCredentials.scopeId, scope.id),
					eq(providerCredentials.label, label),
				),
			)
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	private toAggregate(row: typeof providerCredentials.$inferSelect): ProviderConnectivity.ProviderCredential {
		if (!ProviderConnectivity.isCredentialScopeType(row.scopeType)) {
			throw new InvalidInputError(`Stored credential has invalid scope type "${row.scopeType}"`);
		}
		return ProviderConnectivity.ProviderCredential.rehydrate({
			id: row.id as ProviderConnectivity.ProviderCredentialId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			providerId: ProviderConnectivity.ProviderId.create(row.providerId),
			scope: ProviderConnectivity.CredentialScope.fromRaw({ type: row.scopeType, id: row.scopeId }),
			label: row.label,
			encryptedSecret: ProviderConnectivity.EncryptedSecret.fromEnvelope({
				ciphertext: row.ciphertext,
				nonce: row.nonce,
				lastFour: row.lastFour,
			}),
			expiresAt: row.expiresAt,
			revokedAt: row.revokedAt,
			createdAt: row.createdAt,
		});
	}
}
