import type { IdentityAccess as IADomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { AuthenticateUserUseCase } from './use-cases/authenticate-user.use-case.js';
import { InviteUserUseCase } from './use-cases/invite-user.use-case.js';
import { IssueApiTokenUseCase } from './use-cases/issue-api-token.use-case.js';
import { RegisterOrganizationUseCase } from './use-cases/register-organization.use-case.js';

/**
 * Concrete dependencies the identity-access context needs from
 * `SharedDeps`. Composition root populates these on the opaque
 * `SharedDeps` brand and `compose` casts down to this narrower view.
 *
 * Keeping the cast local to each context module preserves the
 * application-layer purity (no import from infrastructure or apps —
 * only domain ports + shared abstractions like Clock / IdGenerator).
 */
export interface IdentityAccessDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly orgRepo: IADomain.OrganizationRepository;
	readonly userRepo: IADomain.UserRepository;
	readonly membershipRepo: IADomain.MembershipRepository;
	readonly apiTokenRepo: IADomain.ApiTokenRepository;
	readonly passwordHasher: IADomain.PasswordHasher;
	readonly apiTokenGenerator: IADomain.ApiTokenGenerator;
}

/**
 * `ContextModule` for identity-access. The composition root iterates
 * every context's module and merges their `useCases` maps into the DI
 * registry; `ingestUseCases` and `eventHandlers` are empty here because
 * identity-access has no provider ingest or auto-schedule today.
 */
export const identityAccessModule: ContextModule = {
	id: 'identity-access',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as IdentityAccessDeps;
		const registerOrganization = new RegisterOrganizationUseCase(
			d.orgRepo,
			d.userRepo,
			d.membershipRepo,
			d.passwordHasher,
			d.clock,
			d.ids,
			d.events,
		);
		const authenticateUser = new AuthenticateUserUseCase(d.userRepo, d.passwordHasher);
		const inviteUser = new InviteUserUseCase(d.membershipRepo, d.userRepo, d.clock, d.ids, d.events);
		const issueApiToken = new IssueApiTokenUseCase(
			d.membershipRepo,
			d.apiTokenRepo,
			d.apiTokenGenerator,
			d.clock,
			d.ids,
		);
		return {
			useCases: {
				RegisterOrganization: registerOrganization,
				AuthenticateUser: authenticateUser,
				InviteUser: inviteUser,
				IssueApiToken: issueApiToken,
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: [],
		};
	},
};
