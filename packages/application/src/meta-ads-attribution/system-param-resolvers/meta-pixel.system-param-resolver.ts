import type { MetaAdsAttribution, ProjectManagement } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Resolves `metaPixelId` for `meta-pixel-events-stats` schedules. Mirrors
 * `Ga4PropertySystemParamResolver`: maps the user-facing `params.pixelId`
 * to the internal MetaPixel id the worker's processor needs.
 */
export class MetaPixelSystemParamResolver implements SystemParamResolver {
	constructor(private readonly pixels: MetaAdsAttribution.MetaPixelRepository) {}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		if (input.providerId !== 'meta') return {};
		if (input.endpointId !== 'meta-pixel-events-stats') return {};

		const pixelId = input.params.pixelId;
		if (typeof pixelId !== 'string' || pixelId.length === 0) {
			throw new InvalidInputError(
				'meta-pixel-events-stats schedule requires `params.pixelId` (8+ digit numeric Meta Pixel id).',
			);
		}

		const pixel = await this.pixels.findByProjectAndHandle(
			input.projectId as ProjectManagement.ProjectId,
			pixelId,
		);
		if (!pixel?.isActive()) {
			throw new NotFoundError(
				`Meta pixel ${pixelId} is not linked to project ${input.projectId}. ` +
					'Link it first via POST /projects/:id/meta/pixels — that path auto-creates the daily schedule.',
			);
		}

		return { metaPixelId: pixel.id };
	}
}
