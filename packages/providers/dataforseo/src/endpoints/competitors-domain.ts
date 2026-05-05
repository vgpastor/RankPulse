import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { DataForSeoHttp } from '../http.js';

export const CompetitorsDomainParams = z.object({
	target: z.string().min(3).max(253),
	locationCode: z.number().int().min(1).max(99_999_999),
	languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
	limit: z.number().int().min(1).max(1000).default(50),
});
export type CompetitorsDomainParams = z.infer<typeof CompetitorsDomainParams>;

export const COMPETITORS_DOMAIN_COST_CENTS = 3;

export const competitorsDomainDescriptor: EndpointDescriptor = {
	id: 'dataforseo-labs-competitors-domain',
	category: 'rankings',
	displayName: 'DataForSEO Labs — competitor domains',
	description:
		'Domains that rank on the same SERPs as the target site, with intersection size and average rank. Complements #18 auto-discovery: aggregate competitor signal in one shot.',
	paramsSchema: CompetitorsDomainParams,
	cost: { unit: 'usd_cents', amount: COMPETITORS_DOMAIN_COST_CENTS },
	defaultCron: '0 11 * * 0',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/dataforseo_labs/google/competitors_domain/live';

export interface CompetitorsDomainItem {
	domain: string;
	avg_position?: number | null;
	intersections?: number | null;
	full_domain_metrics?: {
		organic?: { count?: number; etv?: number };
	};
}

export interface CompetitorsDomainResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{ total_count?: number; items?: CompetitorsDomainItem[] }>;
	}>;
}

export const buildCompetitorsDomainBody = (params: CompetitorsDomainParams): unknown[] => [
	{
		target: params.target,
		location_code: params.locationCode,
		language_code: params.languageCode,
		limit: params.limit,
	},
];

export const fetchCompetitorsDomain = async (
	http: DataForSeoHttp,
	params: CompetitorsDomainParams,
	ctx: FetchContext,
): Promise<CompetitorsDomainResponse> => {
	const body = buildCompetitorsDomainBody(params);
	const raw = (await http.post(PATH, body, ctx.credential.plaintextSecret, ctx.signal)) as CompetitorsDomainResponse;
	if (raw.status_code !== 20000) {
		ctx.logger.warn('DataForSEO competitors-domain returned a non-success status', {
			status: raw.status_code,
			message: raw.status_message,
		});
	}
	return raw;
};
