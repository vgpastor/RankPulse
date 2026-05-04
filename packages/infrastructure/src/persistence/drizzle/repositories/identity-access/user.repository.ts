import { IdentityAccess } from '@rankpulse/domain';
import { eq, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { users } from '../../schema/index.js';

export class DrizzleUserRepository implements IdentityAccess.UserRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(user: IdentityAccess.User): Promise<void> {
		await this.db
			.insert(users)
			.values({
				id: user.id,
				email: user.email.value,
				name: user.name,
				passwordHash: user.passwordHash.value,
				locale: user.locale,
				createdAt: user.createdAt,
			})
			.onConflictDoUpdate({
				target: users.id,
				set: {
					email: user.email.value,
					name: user.name,
					passwordHash: user.passwordHash.value,
					locale: user.locale,
				},
			});
	}

	async findById(id: IdentityAccess.UserId): Promise<IdentityAccess.User | null> {
		const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByEmail(email: IdentityAccess.Email): Promise<IdentityAccess.User | null> {
		const [row] = await this.db
			.select()
			.from(users)
			.where(sql`lower(${users.email}) = lower(${email.value})`)
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	private toAggregate(row: typeof users.$inferSelect): IdentityAccess.User {
		return IdentityAccess.User.rehydrate({
			id: row.id as IdentityAccess.UserId,
			email: IdentityAccess.Email.create(row.email),
			name: row.name,
			passwordHash: IdentityAccess.PasswordHash.fromHashed(row.passwordHash),
			locale: row.locale,
			createdAt: row.createdAt,
		});
	}
}
