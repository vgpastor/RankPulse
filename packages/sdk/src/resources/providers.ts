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
}
