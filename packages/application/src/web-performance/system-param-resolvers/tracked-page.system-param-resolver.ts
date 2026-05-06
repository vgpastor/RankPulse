import type { ProjectManagement } from '@rankpulse/domain';
import { WebPerformance } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Resolves `trackedPageId` for `psi-runpagespeed` schedules. Same
 * pattern as `GscPropertySystemParamResolver` (BACKLOG bug #50).
 *
 * Looks up the TrackedPage entity by `(projectId, params.url, params.strategy)`.
 * `strategy` (mobile|desktop) is part of the natural key because the
 * same URL is tracked twice — once per device class — to align with
 * Google's CWV split.
 */
export class TrackedPageSystemParamResolver implements SystemParamResolver {
	constructor(private readonly pages: WebPerformance.TrackedPageRepository) {}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		if (input.providerId !== 'pagespeed') return {};
		if (input.endpointId !== 'psi-runpagespeed') return {};

		const url = input.params.url;
		const strategy = input.params.strategy;
		if (typeof url !== 'string' || url.length === 0) {
			throw new InvalidInputError('psi-runpagespeed schedule requires `params.url` (full URL with scheme).');
		}
		if (strategy !== 'mobile' && strategy !== 'desktop') {
			throw new InvalidInputError(
				'psi-runpagespeed schedule requires `params.strategy` of "mobile" or "desktop".',
			);
		}

		// Construct value objects — the repo dereferences `.value` on PageUrl
		// during the SQL where-clause, so passing a raw string yields
		// UNDEFINED_VALUE in postgres-js. PageUrl.create() validates the
		// scheme/length too, so a bad params.url short-circuits here with
		// InvalidInputError instead of leaking an SQL error to the caller.
		const page = await this.pages.findByTuple(
			input.projectId as ProjectManagement.ProjectId,
			WebPerformance.PageUrl.create(url),
			strategy as WebPerformance.PageSpeedStrategy,
		);
		if (!page) {
			throw new NotFoundError(
				`PSI tracked page ${strategy}|${url} is not registered for project ${input.projectId}. ` +
					'Track it first via POST /projects/:id/page-speed/pages.',
			);
		}

		return { trackedPageId: page.id };
	}
}
