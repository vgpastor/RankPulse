import type { User } from '../entities/user.js';
import type { Email } from '../value-objects/email.js';
import type { UserId } from '../value-objects/identifiers.js';

export interface UserRepository {
	save(user: User): Promise<void>;
	findById(id: UserId): Promise<User | null>;
	findByEmail(email: Email): Promise<User | null>;
}
