import type { ProviderConnectivity as PCDomain, SharedKernel } from '@rankpulse/domain';
import type { Clock, IdGenerator } from '@rankpulse/shared';
import type { ContextModule, ContextRegistrations, SharedDeps } from '../_core/module.js';
import { ListJobRunsUseCase } from './use-cases/list-job-runs.use-case.js';
import {
	DeleteJobDefinitionUseCase,
	GetJobDefinitionUseCase,
	ListJobDefinitionsUseCase,
	UpdateJobDefinitionUseCase,
} from './use-cases/manage-job-definition.use-cases.js';
import { RecordApiUsageUseCase } from './use-cases/record-api-usage.use-case.js';
import {
	type CredentialFormatValidator,
	RegisterProviderCredentialUseCase,
} from './use-cases/register-provider-credential.use-case.js';
import { ResolveProviderCredentialUseCase } from './use-cases/resolve-provider-credential.use-case.js';
import {
	type EndpointParamsValidator,
	ScheduleEndpointFetchUseCase,
} from './use-cases/schedule-endpoint-fetch.use-case.js';
import { TriggerJobDefinitionRunUseCase } from './use-cases/trigger-job-definition-run.use-case.js';

export interface ProviderConnectivityDeps {
	readonly clock: Clock;
	readonly ids: IdGenerator;
	readonly events: SharedKernel.EventPublisher;
	readonly credentialRepo: PCDomain.CredentialRepository;
	readonly credentialVault: PCDomain.CredentialVault;
	readonly jobDefRepo: PCDomain.JobDefinitionRepository;
	readonly jobRunRepo: PCDomain.JobRunRepository;
	readonly apiUsageRepo: PCDomain.ApiUsageRepository;
	readonly jobScheduler: PCDomain.JobScheduler;
	/**
	 * Tiny adapter the composition root builds over the actual provider
	 * registry. Keeps the application layer decoupled from
	 * `@rankpulse/provider-core` (the use cases only need a `validate`
	 * callback shape).
	 */
	readonly credentialFormatValidator: CredentialFormatValidator;
	/** Same idea for endpoint params validation — adapter over the registry. */
	readonly endpointParamsValidator: EndpointParamsValidator;
	readonly providerConnectivitySchemaTables: readonly unknown[];
}

export const providerConnectivityModule: ContextModule = {
	id: 'provider-connectivity',
	compose(deps: SharedDeps): ContextRegistrations {
		const d = deps as unknown as ProviderConnectivityDeps;
		return {
			useCases: {
				RegisterProviderCredential: new RegisterProviderCredentialUseCase(
					d.credentialRepo,
					d.credentialVault,
					d.credentialFormatValidator,
					d.clock,
					d.ids,
					d.events,
				),
				ResolveProviderCredential: new ResolveProviderCredentialUseCase(
					d.credentialRepo,
					d.credentialVault,
					d.clock,
				),
				ScheduleEndpointFetch: new ScheduleEndpointFetchUseCase(
					d.jobDefRepo,
					d.jobScheduler,
					d.endpointParamsValidator,
					d.clock,
					d.ids,
					d.events,
				),
				TriggerJobDefinitionRun: new TriggerJobDefinitionRunUseCase(d.jobDefRepo, d.jobScheduler, d.ids),
				ListJobDefinitions: new ListJobDefinitionsUseCase(d.jobDefRepo),
				GetJobDefinition: new GetJobDefinitionUseCase(d.jobDefRepo),
				UpdateJobDefinition: new UpdateJobDefinitionUseCase(d.jobDefRepo, d.jobScheduler),
				DeleteJobDefinition: new DeleteJobDefinitionUseCase(d.jobDefRepo, d.jobScheduler),
				ListJobRuns: new ListJobRunsUseCase(d.jobRunRepo),
				RecordApiUsage: new RecordApiUsageUseCase(d.apiUsageRepo, d.clock, d.ids, d.events),
			},
			ingestUseCases: {},
			eventHandlers: [],
			schemaTables: d.providerConnectivitySchemaTables,
		};
	},
};
