import type { IdentityAccess } from '@rankpulse/domain';

export class InMemoryUserRepository implements IdentityAccess.UserRepository {
	private byId = new Map<string, IdentityAccess.User>();
	private byEmail = new Map<string, string>();

	async save(user: IdentityAccess.User): Promise<void> {
		this.byId.set(user.id, user);
		this.byEmail.set(user.email.value, user.id);
	}

	async findById(id: IdentityAccess.UserId): Promise<IdentityAccess.User | null> {
		return this.byId.get(id) ?? null;
	}

	async findByEmail(email: IdentityAccess.Email): Promise<IdentityAccess.User | null> {
		const id = this.byEmail.get(email.value);
		return id ? (this.byId.get(id) ?? null) : null;
	}

	size(): number {
		return this.byId.size;
	}
}
