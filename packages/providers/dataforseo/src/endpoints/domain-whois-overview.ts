import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { DataForSeoHttp } from '../http.js';

export const DomainWhoisOverviewParams = z.object({
	target: z.string().min(3).max(253),
	limit: z.number().int().min(1).max(100).default(1),
});
export type DomainWhoisOverviewParams = z.infer<typeof DomainWhoisOverviewParams>;

/** Whois is mostly cached upstream — DataForSEO charges $0.0005/domain. */
export const DOMAIN_WHOIS_COST_CENTS = 0.05;

export const domainWhoisOverviewDescriptor: EndpointDescriptor = {
	id: 'domain-analytics-whois-overview',
	category: 'rankings',
	displayName: 'Domain Analytics — whois overview',
	description:
		'Registrar, creation/expiration dates, IP and basic SEO metrics for a domain. Used to flag young/expired competitors.',
	paramsSchema: DomainWhoisOverviewParams,
	cost: { unit: 'usd_cents', amount: DOMAIN_WHOIS_COST_CENTS },
	defaultCron: '0 12 1 * *',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/domain_analytics/whois/overview/live';

export interface DomainWhoisItem {
	domain: string;
	created_datetime?: string | null;
	changed_datetime?: string | null;
	expiration_datetime?: string | null;
	first_seen?: string | null;
	registrar?: string | null;
	tld?: string | null;
	metrics?: {
		organic?: { count?: number; etv?: number };
	};
}

export interface DomainWhoisResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{ items?: DomainWhoisItem[] }>;
	}>;
}

export const buildDomainWhoisBody = (params: DomainWhoisOverviewParams): unknown[] => [
	{
		target: params.target,
		limit: params.limit,
	},
];

export const fetchDomainWhoisOverview = async (
	http: DataForSeoHttp,
	params: DomainWhoisOverviewParams,
	ctx: FetchContext,
): Promise<DomainWhoisResponse> => {
	const body = buildDomainWhoisBody(params);
	const raw = (await http.post(PATH, body, ctx.credential.plaintextSecret, ctx.signal)) as DomainWhoisResponse;
	if (raw.status_code !== 20000) {
		ctx.logger.warn('DataForSEO whois-overview returned a non-success status', {
			status: raw.status_code,
			message: raw.status_message,
		});
	}
	return raw;
};
