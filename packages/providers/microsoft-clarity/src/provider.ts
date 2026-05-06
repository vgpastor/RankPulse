import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { validateClarityToken } from './credential.js';
import { type DataExportParams, dataExportDescriptor, fetchDataExport } from './endpoints/data-export.js';
import { ClarityHttp } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [dataExportDescriptor];

export class ClarityProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('microsoft-clarity');
	readonly displayName = 'Microsoft Clarity';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: ClarityHttp;

	constructor(options?: { fetchImpl?: typeof fetch }) {
		this.http = new ClarityHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		validateClarityToken(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case dataExportDescriptor.id: {
				const parsed = dataExportDescriptor.paramsSchema.safeParse(params);
				if (!parsed.success) {
					throw new InvalidInputError(`Invalid params for ${endpointId}: ${parsed.error.message}`);
				}
				return await fetchDataExport(this.http, parsed.data as DataExportParams, ctx);
			}
			default:
				throw new InvalidInputError(`microsoft-clarity has no endpoint "${endpointId}"`);
		}
	}
}
