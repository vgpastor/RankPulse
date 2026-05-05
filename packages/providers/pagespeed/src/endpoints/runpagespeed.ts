import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { PageSpeedHttp } from '../http.js';

/**
 * `runPagespeed` — Lighthouse audit + CrUX (real-user metrics) for a
 * single URL. PSI returns BOTH lab metrics (lighthouseResult) and
 * field metrics (loadingExperience). For SEO purposes the field
 * metrics are what Google ranks against.
 */
export const RunPagespeedParams = z.object({
	url: z.string().url(),
	strategy: z.enum(['mobile', 'desktop']).default('mobile'),
	category: z
		.array(z.enum(['performance', 'accessibility', 'best-practices', 'seo', 'pwa']))
		.default(['performance', 'seo', 'best-practices', 'accessibility']),
	locale: z.string().min(2).max(10).default('en'),
});
export type RunPagespeedParams = z.infer<typeof RunPagespeedParams>;

/** Free quota — cost ledger is informational only. */
export const PSI_COST_CENTS = 0;

export const runPagespeedDescriptor: EndpointDescriptor = {
	id: 'psi-runpagespeed',
	category: 'onpage',
	displayName: 'PageSpeed Insights — runPagespeed',
	description:
		'Lab metrics (Lighthouse) + field metrics (CrUX): LCP, INP, CLS, FCP, TTFB plus performance/SEO/accessibility scores for a URL.',
	paramsSchema: RunPagespeedParams,
	cost: { unit: 'usd_cents', amount: PSI_COST_CENTS },
	defaultCron: '0 3 * * *',
	rateLimit: { max: 1, durationMs: 1_000 },
};

const PATH = '/pagespeedonline/v5/runPagespeed';

/** Subset of the PSI v5 response we actually care about. */
export interface RunPagespeedResponse {
	id?: string;
	loadingExperience?: {
		metrics?: Record<
			string,
			{
				percentile?: number;
				category?: 'FAST' | 'AVERAGE' | 'SLOW';
				distributions?: Array<{ min: number; max?: number; proportion: number }>;
			}
		>;
		overall_category?: string;
	};
	originLoadingExperience?: {
		metrics?: Record<string, { percentile?: number; category?: string }>;
	};
	lighthouseResult?: {
		categories?: Record<string, { score?: number | null }>;
		audits?: Record<
			string,
			{
				score?: number | null;
				numericValue?: number;
				displayValue?: string;
			}
		>;
	};
	analysisUTCTimestamp?: string;
}

export const fetchRunPagespeed = async (
	http: PageSpeedHttp,
	params: RunPagespeedParams,
	apiKey: string,
	ctx: FetchContext,
): Promise<RunPagespeedResponse> => {
	const query: Record<string, string | string[]> = {
		url: params.url,
		strategy: params.strategy,
		locale: params.locale,
		category: params.category,
		key: apiKey,
	};
	const raw = (await http.get(PATH, query, ctx.signal)) as RunPagespeedResponse;
	if (!raw || typeof raw !== 'object') {
		ctx.logger.warn('PSI returned empty or non-object response', { raw });
		return {};
	}
	return raw;
};
