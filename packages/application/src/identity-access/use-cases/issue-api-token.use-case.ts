import { IdentityAccess } from '@rankpulse/domain';
import { type Clock, ForbiddenError, type IdGenerator, NotFoundError } from '@rankpulse/shared';

export interface IssueApiTokenCommand {
	organizationId: string;
	requestedByUserId: string;
	name: string;
	scopes: readonly string[];
	expiresAt: Date | null;
}

export interface IssueApiTokenResult {
	tokenId: string;
	plaintextToken: string;
}

/**
 * Issues a new API token. The plaintext is returned exactly once; only the
 * hashed value is persisted.
 */
export class IssueApiTokenUseCase {
	constructor(
		private readonly memberships: IdentityAccess.MembershipRepository,
		private readonly tokens: IdentityAccess.ApiTokenRepository,
		private readonly tokenGenerator: IdentityAccess.ApiTokenGenerator,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
	) {}

	async execute(cmd: IssueApiTokenCommand): Promise<IssueApiTokenResult> {
		const orgId = cmd.organizationId as IdentityAccess.OrganizationId;
		const userId = cmd.requestedByUserId as IdentityAccess.UserId;

		const membership = await this.memberships.findActiveFor(orgId, userId);
		if (!membership) {
			throw new NotFoundError('No active membership for this user in this organization');
		}
		if (!IdentityAccess.isAtLeast(membership.role, IdentityAccess.Roles.ADMIN)) {
			throw new ForbiddenError('Admin role required to issue API tokens');
		}

		const { plaintext, hashed } = this.tokenGenerator.issue();
		const now = this.clock.now();
		const tokenId = this.ids.generate() as IdentityAccess.ApiTokenId;

		const token = IdentityAccess.ApiToken.issue({
			id: tokenId,
			organizationId: orgId,
			createdBy: userId,
			name: cmd.name,
			hashedToken: hashed,
			scopes: cmd.scopes,
			expiresAt: cmd.expiresAt,
			now,
		});

		await this.tokens.save(token);
		return { tokenId, plaintextToken: plaintext };
	}
}
