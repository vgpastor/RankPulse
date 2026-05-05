import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import {
	IdentityAccessContracts,
	ProjectManagementContracts,
	ProviderConnectivityContracts,
	RankTrackingContracts,
	SearchConsoleInsightsContracts,
} from '@rankpulse/contracts';
import { z } from 'zod';

// Augment the global Zod prototype with .openapi() helpers so the registry
// can introspect schema metadata. Must be called before any registry.register*.
extendZodWithOpenApi(z);

const ApiTokenAuthHeader = 'bearerAuth';

/**
 * Hand-rolled OpenAPI 3 generator. We deliberately do NOT use
 * `@nestjs/swagger`'s reflection because @nestjs/swagger 8 crashes when route
 * parameters are typed as Zod-derived type aliases (the runtime type metadata
 * collapses to `Object` or `null` and the explorer dereferences it).
 *
 * Driving the spec from the Zod contracts directly is also the right thing
 * architecturally: contracts is the single source of truth, so the spec is
 * always in sync with what the controllers validate.
 */
export function buildOpenApiDocument(): unknown {
	const registry = new OpenAPIRegistry();

	registry.registerComponent('securitySchemes', ApiTokenAuthHeader, {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
	});

	const ProblemDetails = registry.register(
		'ProblemDetails',
		z.object({
			type: z.string(),
			title: z.string(),
			status: z.number().int(),
			detail: z.string().optional(),
			code: z.string().optional(),
		}),
	);

	const errorResponses = (
		statuses: readonly number[],
	): Record<string, { description: string; content: Record<string, { schema: unknown }> }> => {
		const out: Record<string, { description: string; content: Record<string, { schema: unknown }> }> = {};
		for (const s of statuses) {
			out[String(s)] = {
				description: PROBLEM_DESCRIPTIONS[s] ?? 'Error',
				content: { 'application/json': { schema: ProblemDetails } },
			};
		}
		return out;
	};

	// ---- identity-access ----

	registry.registerPath({
		method: 'post',
		path: '/api/v1/auth/register',
		summary: 'Register a new organization with its owner user',
		tags: ['identity-access'],
		request: {
			body: {
				content: {
					'application/json': { schema: IdentityAccessContracts.RegisterOrganizationRequest },
				},
			},
		},
		responses: {
			201: {
				description: 'Organization, user and OWNER membership created',
				content: { 'application/json': { schema: IdentityAccessContracts.RegisterOrganizationResponse } },
			},
			...errorResponses([400, 409]),
		},
	});

	registry.registerPath({
		method: 'post',
		path: '/api/v1/auth/login',
		summary: 'Authenticate with email + password and receive a JWT',
		tags: ['identity-access'],
		request: {
			body: { content: { 'application/json': { schema: IdentityAccessContracts.LoginRequest } } },
		},
		responses: {
			200: {
				description: 'Access token + user descriptor',
				content: {
					'application/json': {
						schema: z.object({
							accessToken: z.string(),
							expiresAt: z.string().datetime(),
							user: z.object({
								userId: z.string().uuid(),
								email: z.string().email(),
								name: z.string(),
							}),
						}),
					},
				},
			},
			...errorResponses([400, 401]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/me',
		summary: 'Return the authenticated user with active memberships',
		tags: ['identity-access'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		responses: {
			200: {
				description: 'Current user',
				content: { 'application/json': { schema: IdentityAccessContracts.MeResponse } },
			},
			...errorResponses([401, 404]),
		},
	});

	// ---- project-management ----

	registry.registerPath({
		method: 'post',
		path: '/api/v1/projects',
		summary: 'Create a new project in an organization',
		tags: ['project-management'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			body: { content: { 'application/json': { schema: ProjectManagementContracts.CreateProjectRequest } } },
		},
		responses: {
			201: {
				description: 'Created project',
				content: { 'application/json': { schema: ProjectManagementContracts.ProjectDto } },
			},
			...errorResponses([400, 401, 403, 409]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/projects',
		summary: 'List projects in an organization',
		tags: ['project-management'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			query: z.object({ organizationId: z.string().uuid() }),
		},
		responses: {
			200: {
				description: 'Projects',
				content: { 'application/json': { schema: z.array(ProjectManagementContracts.ProjectDto) } },
			},
			...errorResponses([401, 403]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/projects/{id}',
		summary: 'Get a single project by id',
		tags: ['project-management'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ id: z.string().uuid() }) },
		responses: {
			200: {
				description: 'Project',
				content: { 'application/json': { schema: ProjectManagementContracts.ProjectDto } },
			},
			...errorResponses([401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'post',
		path: '/api/v1/projects/{id}/competitors',
		summary: 'Track a competitor for a project',
		tags: ['project-management'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			params: z.object({ id: z.string().uuid() }),
			body: { content: { 'application/json': { schema: ProjectManagementContracts.AddCompetitorRequest } } },
		},
		responses: {
			201: {
				description: 'Competitor id',
				content: { 'application/json': { schema: z.object({ competitorId: z.string().uuid() }) } },
			},
			...errorResponses([400, 401, 403, 404, 409]),
		},
	});

	registry.registerPath({
		method: 'post',
		path: '/api/v1/projects/{id}/keywords',
		summary: 'Import keywords (batch) into a project keyword list',
		tags: ['project-management'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			params: z.object({ id: z.string().uuid() }),
			body: { content: { 'application/json': { schema: ProjectManagementContracts.ImportKeywordsRequest } } },
		},
		responses: {
			201: {
				description: 'List id and number added',
				content: {
					'application/json': {
						schema: z.object({ keywordListId: z.string().uuid(), added: z.number().int() }),
					},
				},
			},
			...errorResponses([400, 401, 403, 404]),
		},
	});

	// ---- portfolios (project-management) ----

	registry.registerPath({
		method: 'post',
		path: '/api/v1/organizations/{orgId}/portfolios',
		summary: 'Create a portfolio in an organization',
		tags: ['project-management'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			params: z.object({ orgId: z.string().uuid() }),
			body: {
				content: { 'application/json': { schema: ProjectManagementContracts.CreatePortfolioRequest } },
			},
		},
		responses: {
			201: {
				description: 'Portfolio id',
				content: { 'application/json': { schema: z.object({ portfolioId: z.string().uuid() }) } },
			},
			...errorResponses([400, 401, 403]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/organizations/{orgId}/portfolios',
		summary: 'List portfolios in an organization',
		tags: ['project-management'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ orgId: z.string().uuid() }) },
		responses: {
			200: {
				description: 'Portfolios',
				content: { 'application/json': { schema: z.array(ProjectManagementContracts.PortfolioDto) } },
			},
			...errorResponses([401, 403]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/portfolios/{id}',
		summary: 'Get a portfolio by id',
		tags: ['project-management'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ id: z.string().uuid() }) },
		responses: {
			200: {
				description: 'Portfolio',
				content: { 'application/json': { schema: ProjectManagementContracts.PortfolioDto } },
			},
			...errorResponses([401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'patch',
		path: '/api/v1/portfolios/{id}',
		summary: 'Rename a portfolio',
		tags: ['project-management'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			params: z.object({ id: z.string().uuid() }),
			body: {
				content: { 'application/json': { schema: ProjectManagementContracts.RenamePortfolioRequest } },
			},
		},
		responses: {
			200: {
				description: 'Updated portfolio',
				content: { 'application/json': { schema: ProjectManagementContracts.PortfolioDto } },
			},
			...errorResponses([400, 401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'delete',
		path: '/api/v1/portfolios/{id}',
		summary: 'Delete a portfolio (rejects if any project still references it)',
		tags: ['project-management'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ id: z.string().uuid() }) },
		responses: {
			204: { description: 'Deleted' },
			...errorResponses([401, 403, 404, 409]),
		},
	});

	// ---- provider-connectivity ----

	registry.registerPath({
		method: 'get',
		path: '/api/v1/providers',
		summary: 'List active providers and their endpoint catalogue',
		tags: ['provider-connectivity'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		responses: {
			200: {
				description: 'Providers',
				content: { 'application/json': { schema: z.array(ProviderConnectivityContracts.ProviderDto) } },
			},
			...errorResponses([401]),
		},
	});

	registry.registerPath({
		method: 'post',
		path: '/api/v1/providers/{providerId}/credentials',
		summary: 'Register a new credential bound to an org / portfolio / project / domain scope',
		tags: ['provider-connectivity'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			params: z.object({ providerId: z.string() }),
			body: {
				content: { 'application/json': { schema: ProviderConnectivityContracts.RegisterCredentialRequest } },
			},
		},
		responses: {
			201: {
				description: 'Credential registered',
				content: {
					'application/json': {
						schema: z.object({ credentialId: z.string().uuid(), lastFour: z.string() }),
					},
				},
			},
			...errorResponses([400, 401, 403, 409]),
		},
	});

	registry.registerPath({
		method: 'post',
		path: '/api/v1/providers/{providerId}/endpoints/{endpointId}/schedule',
		summary: 'Schedule a recurring fetch for the given (project, endpoint, params)',
		tags: ['provider-connectivity'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			params: z.object({ providerId: z.string(), endpointId: z.string() }),
			body: {
				content: { 'application/json': { schema: ProviderConnectivityContracts.ScheduleEndpointRequest } },
			},
		},
		responses: {
			201: {
				description: 'Scheduled job definition id',
				content: { 'application/json': { schema: z.object({ definitionId: z.string().uuid() }) } },
			},
			...errorResponses([400, 401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'post',
		path: '/api/v1/providers/{providerId}/job-definitions/{definitionId}/run-now',
		summary: 'Trigger an immediate one-off run of an existing job definition',
		tags: ['provider-connectivity'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ providerId: z.string(), definitionId: z.string().uuid() }) },
		responses: {
			201: {
				description: 'Run enqueued',
				content: {
					'application/json': {
						schema: z.object({ runId: z.string().uuid(), definitionId: z.string().uuid() }),
					},
				},
			},
			...errorResponses([401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/providers/job-definitions/by-project/{projectId}',
		summary: 'List all job definitions scheduled for a project',
		tags: ['provider-connectivity'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ projectId: z.string().uuid() }) },
		responses: {
			200: {
				description: 'Job definitions',
				content: { 'application/json': { schema: z.array(ProviderConnectivityContracts.JobDefinitionDto) } },
			},
			...errorResponses([401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/providers/{providerId}/job-definitions/{definitionId}',
		summary: 'Inspect a single job definition',
		tags: ['provider-connectivity'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ providerId: z.string(), definitionId: z.string().uuid() }) },
		responses: {
			200: {
				description: 'Job definition',
				content: { 'application/json': { schema: ProviderConnectivityContracts.JobDefinitionDto } },
			},
			...errorResponses([401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'patch',
		path: '/api/v1/providers/{providerId}/job-definitions/{definitionId}',
		summary: 'Update cron / params / enabled on an existing job definition',
		tags: ['provider-connectivity'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			params: z.object({ providerId: z.string(), definitionId: z.string().uuid() }),
			body: {
				content: {
					'application/json': { schema: ProviderConnectivityContracts.UpdateJobDefinitionRequest },
				},
			},
		},
		responses: {
			200: {
				description: 'Updated job definition',
				content: { 'application/json': { schema: ProviderConnectivityContracts.JobDefinitionDto } },
			},
			...errorResponses([400, 401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'delete',
		path: '/api/v1/providers/{providerId}/job-definitions/{definitionId}',
		summary: 'Unregister and delete a job definition',
		tags: ['provider-connectivity'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ providerId: z.string(), definitionId: z.string().uuid() }) },
		responses: {
			204: { description: 'Deleted' },
			...errorResponses([401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/providers/{providerId}/job-definitions/{definitionId}/runs',
		summary: 'List past runs for a job definition (most recent first, max 50)',
		tags: ['provider-connectivity'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ providerId: z.string(), definitionId: z.string().uuid() }) },
		responses: {
			200: {
				description: 'Runs',
				content: { 'application/json': { schema: z.array(ProviderConnectivityContracts.JobRunDto) } },
			},
			...errorResponses([401, 403, 404]),
		},
	});

	// ---- rank-tracking ----

	registry.registerPath({
		method: 'post',
		path: '/api/v1/rank-tracking/keywords',
		summary: 'Start tracking a keyword for a (project, domain, location, device) tuple',
		tags: ['rank-tracking'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			body: {
				content: { 'application/json': { schema: RankTrackingContracts.StartTrackingKeywordRequest } },
			},
		},
		responses: {
			201: {
				description: 'Tracked keyword id (and optional auto-scheduled definition id)',
				content: {
					'application/json': { schema: RankTrackingContracts.StartTrackingKeywordResponse },
				},
			},
			...errorResponses([400, 401, 403, 404, 409]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/projects/{projectId}/rankings',
		summary: 'List the latest ranking observations for a project',
		tags: ['rank-tracking'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ projectId: z.string().uuid() }) },
		responses: {
			200: {
				description: 'Ranking observations',
				content: { 'application/json': { schema: z.array(z.unknown()) } },
			},
			...errorResponses([401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/rank-tracking/keywords/{id}/history',
		summary: 'Get observation history for a tracked keyword',
		tags: ['rank-tracking'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			params: z.object({ id: z.string().uuid() }),
			query: RankTrackingContracts.RankingHistoryQuery,
		},
		responses: {
			200: {
				description: 'History entries',
				content: { 'application/json': { schema: z.array(RankTrackingContracts.RankingHistoryEntryDto) } },
			},
			...errorResponses([401, 403, 404]),
		},
	});

	// ---- search-console-insights ----

	registry.registerPath({
		method: 'post',
		path: '/api/v1/gsc/properties',
		summary: 'Link a GSC property (URL-prefix or domain) to a project',
		tags: ['search-console-insights'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			body: {
				content: { 'application/json': { schema: SearchConsoleInsightsContracts.LinkGscPropertyRequest } },
			},
		},
		responses: {
			201: {
				description: 'GSC property id',
				content: { 'application/json': { schema: z.object({ gscPropertyId: z.string().uuid() }) } },
			},
			...errorResponses([400, 401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/gsc/projects/{projectId}/properties',
		summary: 'List GSC properties linked to a project',
		tags: ['search-console-insights'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: { params: z.object({ projectId: z.string().uuid() }) },
		responses: {
			200: {
				description: 'Properties',
				content: { 'application/json': { schema: z.array(SearchConsoleInsightsContracts.GscPropertyDto) } },
			},
			...errorResponses([401, 403, 404]),
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/api/v1/gsc/properties/{id}/performance',
		summary: 'Query GSC performance rows for a linked property',
		tags: ['search-console-insights'],
		security: [{ [ApiTokenAuthHeader]: [] }],
		request: {
			params: z.object({ id: z.string().uuid() }),
			query: SearchConsoleInsightsContracts.GscPerformanceQuery,
		},
		responses: {
			200: {
				description: 'Performance rows',
				content: {
					'application/json': {
						schema: z.array(SearchConsoleInsightsContracts.GscPerformancePointDto),
					},
				},
			},
			...errorResponses([401, 403, 404]),
		},
	});

	// ---- health ----

	registry.registerPath({
		method: 'get',
		path: '/healthz',
		summary: 'Liveness probe',
		tags: ['health'],
		responses: {
			200: {
				description: 'OK',
				content: { 'application/json': { schema: z.object({ status: z.literal('ok') }) } },
			},
		},
	});

	registry.registerPath({
		method: 'get',
		path: '/readyz',
		summary: 'Readiness probe (verifies database connection)',
		tags: ['health'],
		responses: {
			200: {
				description: 'Ready',
				content: {
					'application/json': {
						schema: z.object({
							status: z.enum(['ok', 'degraded']),
							checks: z.record(z.string(), z.enum(['ok', 'failing'])),
						}),
					},
				},
			},
		},
	});

	const generator = new OpenApiGeneratorV3(registry.definitions);
	return generator.generateDocument({
		openapi: '3.0.3',
		info: {
			title: 'RankPulse API',
			version: '0.1.0',
			description:
				'Open-source self-hosted SEO intelligence platform — REST API for projects, providers, metrics, alerts and reporting.',
		},
		servers: [{ url: '/' }],
	});
}

const PROBLEM_DESCRIPTIONS: Record<number, string> = {
	400: 'Bad Request',
	401: 'Unauthorized',
	403: 'Forbidden',
	404: 'Not Found',
	409: 'Conflict',
};
