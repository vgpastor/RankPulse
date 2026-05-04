import { InvalidInputError } from '@rankpulse/shared';
import { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import type { Email } from '../value-objects/email.js';
import type { UserId } from '../value-objects/identifiers.js';
import type { PasswordHash } from '../value-objects/password-hash.js';

export interface UserProps {
	id: UserId;
	email: Email;
	name: string;
	passwordHash: PasswordHash;
	locale: string;
	createdAt: Date;
}

export class User extends AggregateRoot {
	private constructor(private readonly props: UserProps) {
		super();
	}

	static register(input: {
		id: UserId;
		email: Email;
		name: string;
		passwordHash: PasswordHash;
		locale?: string;
		now: Date;
	}): User {
		const name = input.name.trim();
		if (name.length < 1) {
			throw new InvalidInputError('User name cannot be empty');
		}
		return new User({
			id: input.id,
			email: input.email,
			name,
			passwordHash: input.passwordHash,
			locale: input.locale ?? 'en',
			createdAt: input.now,
		});
	}

	static rehydrate(props: UserProps): User {
		return new User(props);
	}

	get id(): UserId {
		return this.props.id;
	}
	get email(): Email {
		return this.props.email;
	}
	get name(): string {
		return this.props.name;
	}
	get passwordHash(): PasswordHash {
		return this.props.passwordHash;
	}
	get locale(): string {
		return this.props.locale;
	}
	get createdAt(): Date {
		return this.props.createdAt;
	}
}
