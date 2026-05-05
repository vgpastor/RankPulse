import type { ProviderConnectivityContracts } from '@rankpulse/contracts';
import type { HttpClient } from '../http.js';

export class ProvidersResource {
	constructor(private readonly http: HttpClient) {}

	list(): Promise<ProviderConnectivityContracts.ProviderDto[]> {
		return this.http.get('/providers');
	}

	listEndpoints(providerId: string): Promise<ProviderConnectivityContracts.ProviderDto['endpoints']> {
		return this.http.get(`/providers/${encodeURIComponent(providerId)}/endpoints`);
	}

	registerCredential(
		providerId: string,
		body: ProviderConnectivityContracts.RegisterCredentialRequest,
	): Promise<{ credentialId: string; lastFour: string }> {
		return this.http.post(`/providers/${encodeURIComponent(providerId)}/credentials`, body);
	}

	scheduleEndpoint(
		providerId: string,
		endpointId: string,
		body: ProviderConnectivityContracts.ScheduleEndpointRequest,
	): Promise<{ definitionId: string }> {
		return this.http.post(
			`/providers/${encodeURIComponent(providerId)}/endpoints/${encodeURIComponent(endpointId)}/schedule`,
			body,
		);
	}

	runJobDefinitionNow(
		providerId: string,
		definitionId: string,
	): Promise<{ runId: string; definitionId: string }> {
		return this.http.post(
			`/providers/${encodeURIComponent(providerId)}/job-definitions/${encodeURIComponent(definitionId)}/run-now`,
			{},
		);
	}

	listJobDefinitions(projectId: string): Promise<ProviderConnectivityContracts.JobDefinitionDto[]> {
		return this.http.get(`/providers/job-definitions/by-project/${encodeURIComponent(projectId)}`);
	}

	getJobDefinition(
		providerId: string,
		definitionId: string,
	): Promise<ProviderConnectivityContracts.JobDefinitionDto> {
		return this.http.get(
			`/providers/${encodeURIComponent(providerId)}/job-definitions/${encodeURIComponent(definitionId)}`,
		);
	}

	updateJobDefinition(
		providerId: string,
		definitionId: string,
		body: ProviderConnectivityContracts.UpdateJobDefinitionRequest,
	): Promise<ProviderConnectivityContracts.JobDefinitionDto> {
		return this.http.patch(
			`/providers/${encodeURIComponent(providerId)}/job-definitions/${encodeURIComponent(definitionId)}`,
			body,
		);
	}

	deleteJobDefinition(providerId: string, definitionId: string): Promise<void> {
		return this.http.delete(
			`/providers/${encodeURIComponent(providerId)}/job-definitions/${encodeURIComponent(definitionId)}`,
		);
	}
}
