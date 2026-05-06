import type { MacroContext, ProjectManagement } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Resolves `monitoredDomainId` for `radar-domain-rank` schedules. Same
 * pattern as `GscPropertySystemParamResolver` (BACKLOG bug #50).
 *
 * Looks up the MonitoredDomain entity by `(projectId, params.domain)`.
 * If not registered, points the operator at `POST /projects/:id/macro/
 * monitored-domains` (or whichever path the macro-context module exposes).
 */
export class MonitoredDomainSystemParamResolver implements SystemParamResolver {
	constructor(private readonly domains: MacroContext.MonitoredDomainRepository) {}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		if (input.providerId !== 'cloudflare-radar') return {};
		if (input.endpointId !== 'radar-domain-rank') return {};

		const domain = input.params.domain;
		if (typeof domain !== 'string' || domain.length === 0) {
			throw new InvalidInputError(
				'radar-domain-rank schedule requires `params.domain` (bare domain, no scheme).',
			);
		}

		const found = await this.domains.findByProjectAndDomain(
			input.projectId as ProjectManagement.ProjectId,
			domain,
		);
		if (!found?.isActive()) {
			throw new NotFoundError(
				`Monitored domain ${domain} is not registered for project ${input.projectId}. ` +
					'Register it first via POST /projects/:id/macro/monitored-domains.',
			);
		}

		return { monitoredDomainId: found.id };
	}
}
