import type { ProviderConnectivity as PCUseCases } from '@rankpulse/application';
import type { IdentityAccess, ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import type { ProviderRegistry } from '@rankpulse/provider-core';
import { describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../../common/auth/jwt.service.js';
import { ProvidersController } from './providers.controller.js';

// Fixed UUIDs so the Zod schema (uuid()) accepts the body.
const PROJECT_ID = '22222222-2222-2222-2222-222222222222' as ProjectManagement.ProjectId;
const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;
const USER_ID = '33333333-3333-3333-3333-333333333333' as IdentityAccess.UserId;

const buildPrincipal = (): AuthPrincipal => ({
	userId: USER_ID,
	email: 'test@example.com',
});

/**
 * Build a ProvidersController with all dependencies mocked. Each test only
 * cares about the schedule gate, so the project/membership repos return
 * "happy path" values — the gate must reject BEFORE those are consulted.
 */
const buildController = () => {
	const scheduleExecute = vi.fn().mockResolvedValue({ definitionId: 'def-1' });
	const schedule = { execute: scheduleExecute } as unknown as PCUseCases.ScheduleEndpointFetchUseCase;

	const projects = {
		findById: vi.fn().mockResolvedValue({ id: PROJECT_ID, organizationId: ORG_ID }),
	} as unknown as ProjectManagement.ProjectRepository;

	const memberships = {
		findActiveFor: vi.fn().mockResolvedValue({ organizationId: ORG_ID, userId: USER_ID, role: 'OWNER' }),
	} as unknown as IdentityAccess.MembershipRepository;

	const noop = {} as unknown;
	const controller = new ProvidersController(
		noop as ProviderRegistry,
		noop as PCUseCases.RegisterProviderCredentialUseCase,
		schedule,
		noop as PCUseCases.TriggerJobDefinitionRunUseCase,
		noop as PCUseCases.ListJobDefinitionsUseCase,
		noop as PCUseCases.GetJobDefinitionUseCase,
		noop as PCUseCases.UpdateJobDefinitionUseCase,
		noop as PCUseCases.DeleteJobDefinitionUseCase,
		noop as PCUseCases.ListJobRunsUseCase,
		noop as ProviderConnectivity.JobDefinitionRepository,
		memberships,
		projects,
	);
	return { controller, scheduleExecute };
};

describe('ProvidersController.scheduleEndpoint — entity-bound gate', () => {
	it.each([
		['google-search-console', 'gsc-search-analytics', 'gsc/properties'],
		['google-analytics-4', 'ga4-run-report', 'ga4/properties'],
		['wikipedia', 'wikipedia-pageviews-per-article', 'wikipedia/articles'],
		['bing-webmaster', 'bing-rank-and-traffic-stats', 'bing/properties'],
		['microsoft-clarity', 'clarity-data-export', 'clarity/projects'],
		['pagespeed', 'psi-runpagespeed', 'page-speed/pages'],
		['cloudflare-radar', 'radar-domain-rank', 'radar/domains'],
	])('rejects POST .../schedule for %s/%s with 400 pointing to %s', async (providerId, endpointId, hint) => {
		const { controller, scheduleExecute } = buildController();
		await expect(
			controller.scheduleEndpoint(buildPrincipal(), providerId, endpointId, {
				projectId: PROJECT_ID,
				providerId,
				endpointId,
				params: {},
				cron: '0 5 * * *',
			}),
		).rejects.toMatchObject({
			status: 400,
			message: expect.stringMatching(new RegExp(hint)),
		});
		// Gate runs BEFORE the use case is touched.
		expect(scheduleExecute).not.toHaveBeenCalled();
	});

	it('rejects only when (provider, endpoint) BOTH match the entity-bound entry', async () => {
		// `gsc-search-analytics` under a different provider id should NOT be
		// gated — the gate keys on the pair, not just the endpoint id.
		const { controller, scheduleExecute } = buildController();
		await controller.scheduleEndpoint(buildPrincipal(), 'some-other-provider', 'gsc-search-analytics', {
			projectId: PROJECT_ID,
			providerId: 'some-other-provider',
			endpointId: 'gsc-search-analytics',
			params: {},
			cron: '0 5 * * *',
		});
		expect(scheduleExecute).toHaveBeenCalledTimes(1);
	});

	it('lets unrelated endpoints (e.g. dataforseo serp) through to the use case', async () => {
		const { controller, scheduleExecute } = buildController();
		await controller.scheduleEndpoint(buildPrincipal(), 'dataforseo', 'serp-google', {
			projectId: PROJECT_ID,
			providerId: 'dataforseo',
			endpointId: 'serp-google',
			params: { phrase: 'patroltech', country: 'es' },
			cron: '0 6 * * *',
		});
		expect(scheduleExecute).toHaveBeenCalledTimes(1);
	});
});
