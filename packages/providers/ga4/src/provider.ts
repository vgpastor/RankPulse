import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { parseServiceAccount } from './credential.js';
import { fetchRunReport, type RunReportParams, runReportDescriptor } from './endpoints/run-report.js';
import { Ga4Http } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [runReportDescriptor];

export class Ga4Provider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('google-analytics-4');
	readonly displayName = 'Google Analytics 4';
	readonly authStrategy = 'serviceAccount' as const;

	private readonly http: Ga4Http;

	constructor(options?: { fetchImpl?: typeof fetch }) {
		this.http = new Ga4Http(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		parseServiceAccount(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case runReportDescriptor.id: {
				const parsed = runReportDescriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(`Invalid params for ${endpointId}: ${parsed.error.message}`);
				}
				return await fetchRunReport(this.http, parsed.data as RunReportParams, ctx);
			}
			default:
				throw new InvalidInputError(`google-analytics-4 has no endpoint "${endpointId}"`);
		}
	}
}
