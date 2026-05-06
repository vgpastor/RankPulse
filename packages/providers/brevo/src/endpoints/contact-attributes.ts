import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { BrevoHttp } from '../http.js';

/**
 * `GET /contacts/{identifier}` — fetch a single contact's full attribute set.
 * `identifier` is either the contact id (numeric), the email, or the SMS
 * phone (with `+` prefix). Brevo URL-encodes either equally; we let the
 * caller pass the bare value and encode here.
 *
 * On-demand only: the descriptor declares no default cron because the
 * operator schedules it from the application layer (e.g. when a
 * RankPulse-tracked lead is created). We still set `defaultCron` to
 * `null`-equivalent so the JobDefinition layer can decide. The
 * EndpointDescriptor type requires a string, so we use the cron-canonical
 * "never" value `0 0 31 2 *` — Feb 31st never fires.
 */
export const ContactAttributesParams = z.object({
	identifier: z.string().min(1).max(320),
	identifierType: z.enum(['email_id', 'contact_id', 'phone_id', 'ext_id']).default('email_id'),
});
export type ContactAttributesParams = z.infer<typeof ContactAttributesParams>;

export const contactAttributesDescriptor: EndpointDescriptor = {
	id: 'brevo-contact-attributes',
	category: 'traffic',
	displayName: 'Brevo — contact attributes',
	description:
		'Fetches a single contact (email, phone, or id) with full custom attributes, list memberships, and last-seen timestamps. On-demand — used by enrichment flows, not a recurring cron.',
	paramsSchema: ContactAttributesParams,
	cost: { unit: 'usd_cents', amount: 0 },
	defaultCron: '0 0 31 2 *', // Feb 31st => never; on-demand only
	rateLimit: { max: 60, durationMs: 60_000 },
};

export interface ContactAttributesResponse {
	id?: number;
	email?: string;
	emailBlacklisted?: boolean;
	smsBlacklisted?: boolean;
	createdAt?: string;
	modifiedAt?: string;
	attributes?: Record<string, unknown>;
	listIds?: number[];
	listUnsubscribed?: number[];
	statistics?: {
		messagesSent?: Array<{ campaignId?: number; eventTime?: string }>;
		opened?: Array<{ campaignId?: number; count?: number; eventTime?: string }>;
		clicked?: Array<{ campaignId?: number; count?: number; eventTime?: string; ip?: string }>;
		hardBounces?: Array<{ campaignId?: number; eventTime?: string }>;
		softBounces?: Array<{ campaignId?: number; eventTime?: string }>;
		complaints?: Array<{ campaignId?: number; eventTime?: string }>;
		unsubscriptions?: unknown;
	};
}

export const fetchContactAttributes = async (
	http: BrevoHttp,
	params: ContactAttributesParams,
	ctx: FetchContext,
): Promise<ContactAttributesResponse> => {
	const path = `/contacts/${encodeURIComponent(params.identifier)}`;
	const raw = (await http.get(
		path,
		{ identifierType: params.identifierType },
		ctx.credential.plaintextSecret,
		ctx.signal,
	)) as ContactAttributesResponse;
	return raw ?? {};
};
