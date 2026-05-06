import type { BingWebmasterInsights, ProjectManagement } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Resolves `bingPropertyId` for `bing-rank-and-traffic-stats` schedules.
 * Same pattern as `GscPropertySystemParamResolver` (BACKLOG bug #50).
 *
 * Looks up the BingProperty entity by `(projectId, params.siteUrl)`.
 * If not linked yet, points the operator at `POST /projects/:id/bing/properties`
 * (or whichever path the bing-webmaster-insights module exposes).
 */
export class BingPropertySystemParamResolver implements SystemParamResolver {
	constructor(private readonly properties: BingWebmasterInsights.BingPropertyRepository) {}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		if (input.providerId !== 'bing-webmaster') return {};
		if (input.endpointId !== 'bing-rank-and-traffic-stats') return {};

		const siteUrl = input.params.siteUrl;
		if (typeof siteUrl !== 'string' || siteUrl.length === 0) {
			throw new InvalidInputError(
				'bing-rank-and-traffic-stats schedule requires `params.siteUrl` (e.g. "https://example.com").',
			);
		}

		const property = await this.properties.findByProjectAndSite(
			input.projectId as ProjectManagement.ProjectId,
			siteUrl,
		);
		if (!property?.isActive()) {
			throw new NotFoundError(
				`Bing property ${siteUrl} is not linked to project ${input.projectId}. ` +
					'Link it first via POST /projects/:id/bing/properties.',
			);
		}

		return { bingPropertyId: property.id };
	}
}
