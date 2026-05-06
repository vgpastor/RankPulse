import { ProviderConnectivity } from '@rankpulse/domain';
import type { EndpointDescriptor, FetchContext, Provider } from '@rankpulse/provider-core';
import { InvalidInputError } from '@rankpulse/shared';
import { validateBrevoApiKey } from './credential.js';
import {
	type CampaignStatisticsParams,
	campaignStatisticsDescriptor,
	fetchCampaignStatistics,
} from './endpoints/campaign-statistics.js';
import {
	type ContactAttributesParams,
	contactAttributesDescriptor,
	fetchContactAttributes,
} from './endpoints/contact-attributes.js';
import {
	type ConversationStatsParams,
	conversationStatsDescriptor,
	fetchConversationStats,
} from './endpoints/conversation-stats.js';
import {
	type EmailStatisticsParams,
	emailStatisticsDescriptor,
	fetchEmailStatistics,
} from './endpoints/email-statistics.js';
import { BrevoHttp, type BrevoHttpOptions } from './http.js';

const ENDPOINTS: readonly EndpointDescriptor[] = [
	emailStatisticsDescriptor,
	campaignStatisticsDescriptor,
	conversationStatsDescriptor,
	contactAttributesDescriptor,
];

export class BrevoProvider implements Provider {
	readonly id = ProviderConnectivity.ProviderId.create('brevo');
	readonly displayName = 'Brevo (Sendinblue)';
	readonly authStrategy = 'apiKey' as const;

	private readonly http: BrevoHttp;

	constructor(options?: BrevoHttpOptions) {
		this.http = new BrevoHttp(options);
	}

	discover(): readonly EndpointDescriptor[] {
		return ENDPOINTS;
	}

	validateCredentialPlaintext(plaintextSecret: string): void {
		validateBrevoApiKey(plaintextSecret);
	}

	async fetch(endpointId: string, params: unknown, ctx: FetchContext): Promise<unknown> {
		switch (endpointId) {
			case emailStatisticsDescriptor.id:
				return await fetchEmailStatistics(
					this.http,
					this.parseParams(emailStatisticsDescriptor, params) as EmailStatisticsParams,
					ctx,
				);
			case campaignStatisticsDescriptor.id:
				return await fetchCampaignStatistics(
					this.http,
					this.parseParams(campaignStatisticsDescriptor, params) as CampaignStatisticsParams,
					ctx,
				);
			case conversationStatsDescriptor.id:
				return await fetchConversationStats(
					this.http,
					this.parseParams(conversationStatsDescriptor, params) as ConversationStatsParams,
					ctx,
				);
			case contactAttributesDescriptor.id:
				return await fetchContactAttributes(
					this.http,
					this.parseParams(contactAttributesDescriptor, params) as ContactAttributesParams,
					ctx,
				);
			default:
				throw new InvalidInputError(`brevo has no endpoint "${endpointId}"`);
		}
	}

	private parseParams(descriptor: EndpointDescriptor, raw: unknown): unknown {
		const parsed = descriptor.paramsSchema.safeParse(raw);
		if (!parsed.success) {
			throw new InvalidInputError(`Invalid params for ${descriptor.id}: ${parsed.error.message}`);
		}
		return parsed.data;
	}
}
