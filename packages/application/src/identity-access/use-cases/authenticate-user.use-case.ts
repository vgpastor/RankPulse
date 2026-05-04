import { IdentityAccess } from '@rankpulse/domain';
import { UnauthorizedError } from '@rankpulse/shared';

export interface AuthenticateUserCommand {
	email: string;
	password: string;
}

export interface AuthenticatedUser {
	userId: string;
	email: string;
	name: string;
}

/** Verifies credentials and returns the user identity. Does not issue sessions. */
export class AuthenticateUserUseCase {
	constructor(
		private readonly users: IdentityAccess.UserRepository,
		private readonly passwordHasher: IdentityAccess.PasswordHasher,
	) {}

	async execute(cmd: AuthenticateUserCommand): Promise<AuthenticatedUser> {
		const email = IdentityAccess.Email.create(cmd.email);
		const user = await this.users.findByEmail(email);
		if (!user) {
			throw new UnauthorizedError('Invalid credentials');
		}
		const ok = await this.passwordHasher.verify(cmd.password, user.passwordHash);
		if (!ok) {
			throw new UnauthorizedError('Invalid credentials');
		}
		return { userId: user.id, email: user.email.value, name: user.name };
	}
}
