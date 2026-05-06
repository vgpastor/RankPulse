import type { ProjectManagement, TrafficAnalytics } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Resolves `ga4PropertyId` for `ga4-run-report` schedules. Same pattern
 * as `GscPropertySystemParamResolver` (BACKLOG bug #50). Without this,
 * every GA4 scheduled fetch logs `ga4-run-report job missing
 * ga4PropertyId param; skipping ingest` and discards the response.
 *
 * Looks up the Ga4Property entity by `(projectId, params.propertyId)`.
 * If not linked yet, points the operator at `POST /projects/:id/ga4/properties`.
 */
export class Ga4PropertySystemParamResolver implements SystemParamResolver {
	constructor(private readonly properties: TrafficAnalytics.Ga4PropertyRepository) {}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		if (input.providerId !== 'google-analytics-4') return {};
		if (input.endpointId !== 'ga4-run-report') return {};

		const propertyId = input.params.propertyId;
		if (typeof propertyId !== 'string' || propertyId.length === 0) {
			throw new InvalidInputError(
				'ga4-run-report schedule requires `params.propertyId` (numeric or "properties/<id>" form).',
			);
		}

		// GA4 accepts both `123456` and `properties/123456`; the repo finder
		// is keyed on the raw handle so we pass it through unchanged.
		const property = await this.properties.findByProjectAndHandle(
			input.projectId as ProjectManagement.ProjectId,
			propertyId,
		);
		if (!property?.isActive()) {
			throw new NotFoundError(
				`GA4 property ${propertyId} is not linked to project ${input.projectId}. ` +
					'Link it first via POST /projects/:id/ga4/properties — that path auto-creates the daily schedule.',
			);
		}

		return { ga4PropertyId: property.id };
	}
}
