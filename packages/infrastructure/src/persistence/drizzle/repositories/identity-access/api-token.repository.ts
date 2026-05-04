import { IdentityAccess } from '@rankpulse/domain';
import { desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { apiTokens } from '../../schema/index.js';

export class DrizzleApiTokenRepository implements IdentityAccess.ApiTokenRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(token: IdentityAccess.ApiToken): Promise<void> {
		await this.db
			.insert(apiTokens)
			.values({
				id: token.id,
				organizationId: token.organizationId,
				createdBy: token.createdBy,
				name: token.name,
				hashedToken: token.hashedToken,
				scopes: token.scopes,
				expiresAt: token.expiresAt,
				revokedAt: token.revokedAt,
				createdAt: token.createdAt,
			})
			.onConflictDoUpdate({
				target: apiTokens.id,
				set: {
					name: token.name,
					revokedAt: token.revokedAt,
					scopes: token.scopes,
					expiresAt: token.expiresAt,
				},
			});
	}

	async findById(id: IdentityAccess.ApiTokenId): Promise<IdentityAccess.ApiToken | null> {
		const [row] = await this.db.select().from(apiTokens).where(eq(apiTokens.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByHashedToken(hashedToken: string): Promise<IdentityAccess.ApiToken | null> {
		const [row] = await this.db
			.select()
			.from(apiTokens)
			.where(eq(apiTokens.hashedToken, hashedToken))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly IdentityAccess.ApiToken[]> {
		const rows = await this.db
			.select()
			.from(apiTokens)
			.where(eq(apiTokens.organizationId, orgId))
			.orderBy(desc(apiTokens.createdAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof apiTokens.$inferSelect): IdentityAccess.ApiToken {
		return IdentityAccess.ApiToken.rehydrate({
			id: row.id as IdentityAccess.ApiTokenId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			createdBy: row.createdBy as IdentityAccess.UserId,
			name: row.name,
			hashedToken: row.hashedToken,
			scopes: row.scopes,
			expiresAt: row.expiresAt,
			revokedAt: row.revokedAt,
			createdAt: row.createdAt,
		});
	}
}
