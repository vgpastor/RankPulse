import type { MetaAdsAttribution, ProjectManagement } from '@rankpulse/domain';
import { InvalidInputError, NotFoundError } from '@rankpulse/shared';
import type { SystemParamResolver } from '../../provider-connectivity/use-cases/schedule-endpoint-fetch.use-case.js';

/**
 * Resolves `metaAdAccountId` for `meta-ads-insights` and
 * `meta-custom-audiences` schedules. Both endpoints share the same
 * user-facing `params.adAccountId`; the resolver normalises it through
 * the linked entity so the worker writes ingest rows under the internal
 * id even if the operator typed `act_<id>` or the bare digits.
 */
export class MetaAdAccountSystemParamResolver implements SystemParamResolver {
	constructor(private readonly accounts: MetaAdsAttribution.MetaAdAccountRepository) {}

	async resolve(input: {
		projectId: string;
		providerId: string;
		endpointId: string;
		params: Record<string, unknown>;
	}): Promise<Record<string, unknown>> {
		if (input.providerId !== 'meta') return {};
		if (input.endpointId !== 'meta-ads-insights' && input.endpointId !== 'meta-custom-audiences') {
			return {};
		}

		const adAccountId = input.params.adAccountId;
		if (typeof adAccountId !== 'string' || adAccountId.length === 0) {
			throw new InvalidInputError(
				`${input.endpointId} schedule requires \`params.adAccountId\` (numeric or "act_<digits>").`,
			);
		}

		const account = await this.accounts.findByProjectAndHandle(
			input.projectId as ProjectManagement.ProjectId,
			adAccountId,
		);
		if (!account?.isActive()) {
			throw new NotFoundError(
				`Meta ad account ${adAccountId} is not linked to project ${input.projectId}. ` +
					'Link it first via POST /projects/:id/meta/ad-accounts — that path auto-creates the daily schedule.',
			);
		}

		return { metaAdAccountId: account.id };
	}
}
