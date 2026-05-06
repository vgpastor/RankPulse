import type { ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Resolves `gscPropertyId` for `gsc-search-analytics` schedules.
 *
 * BACKLOG bug #50 — when an operator hits `POST /providers/google-search-console/
 * endpoints/gsc-search-analytics/schedule` directly (instead of going through
 * the auto-schedule on `POST /gsc/properties`), the resulting JobDefinition
 * lacked `gscPropertyId` in `systemParams`. The worker's processor then
 * skipped ingest with `gsc-search-analytics job missing gscPropertyId param;
 * skipping ingest`, silently discarding every fetched payload.
 *
 * This resolver looks up the GscProperty entity by `(projectId, params.siteUrl)`
 * and injects its id. If the property isn't linked yet we bail with a clear
 * error pointing the operator at `POST /gsc/properties` — that path runs
 * `LinkGscPropertyUseCase` which fires `GscPropertyLinked`, which the
 * `AutoScheduleOnGscPropertyLinkedHandler` then converts into a properly
 * scoped JobDefinition without the operator having to think about it.
 */
export class GscPropertySystemParamResolver implements SystemParamResolver {
	constructor(private readonly properties: SearchConsoleInsights.GscPropertyRepository) {}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		// Tight match — only this provider/endpoint pair needs gscPropertyId.
		// Any other request: no-op.
		if (input.providerId !== 'google-search-console') return {};
		if (input.endpointId !== 'gsc-search-analytics') return {};

		const siteUrl = input.params.siteUrl;
		if (typeof siteUrl !== 'string' || siteUrl.length === 0) {
			throw new InvalidInputError(
				'gsc-search-analytics schedule requires `params.siteUrl` (e.g. "sc-domain:example.com").',
			);
		}

		const property = await this.properties.findByProjectAndSite(
			input.projectId as ProjectManagement.ProjectId,
			siteUrl,
		);
		if (!property?.isActive()) {
			throw new NotFoundError(
				`GSC property ${siteUrl} is not linked to project ${input.projectId}. ` +
					'Link it first via POST /gsc/properties — that path auto-creates the daily schedule.',
			);
		}

		return { gscPropertyId: property.id };
	}
}
