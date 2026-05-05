import type { EndpointDescriptor, FetchContext } from '@rankpulse/provider-core';
import { z } from 'zod';
import type { DataForSeoHttp } from '../http.js';

export const KeywordDifficultyParams = z.object({
	keywords: z.array(z.string().min(1).max(700)).min(1).max(1000),
	locationCode: z.number().int().min(1).max(99_999_999),
	languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
});
export type KeywordDifficultyParams = z.infer<typeof KeywordDifficultyParams>;

/** $0.01/100 keywords from DataForSEO Labs. Cost here is for one full call. */
export const KEYWORD_DIFFICULTY_COST_CENTS = 1;

export const keywordDifficultyDescriptor: EndpointDescriptor = {
	id: 'dataforseo-labs-keyword-difficulty',
	category: 'keywords',
	displayName: 'DataForSEO Labs — keyword difficulty',
	description:
		'0–100 SEO difficulty score for up to 1000 keywords. Combine with search volume to prioritise tracking targets.',
	paramsSchema: KeywordDifficultyParams,
	cost: { unit: 'usd_cents', amount: KEYWORD_DIFFICULTY_COST_CENTS },
	defaultCron: '0 8 * * 0',
	rateLimit: { max: 2_000, durationMs: 60_000 },
};

const PATH = '/v3/dataforseo_labs/google/bulk_keyword_difficulty/live';

export interface KeywordDifficultyItem {
	keyword: string;
	keyword_difficulty: number | null;
}

export interface KeywordDifficultyResponse {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Array<{
		status_code: number;
		status_message: string;
		result?: Array<{ items?: KeywordDifficultyItem[] }>;
	}>;
}

export const buildKeywordDifficultyBody = (params: KeywordDifficultyParams): unknown[] => [
	{
		keywords: params.keywords,
		location_code: params.locationCode,
		language_code: params.languageCode,
	},
];

export const fetchKeywordDifficulty = async (
	http: DataForSeoHttp,
	params: KeywordDifficultyParams,
	ctx: FetchContext,
): Promise<KeywordDifficultyResponse> => {
	const body = buildKeywordDifficultyBody(params);
	const raw = (await http.post(PATH, body, ctx.credential.plaintextSecret, ctx.signal)) as KeywordDifficultyResponse;
	if (raw.status_code !== 20000) {
		ctx.logger.warn('DataForSEO keyword-difficulty returned a non-success status', {
			status: raw.status_code,
			message: raw.status_message,
		});
	}
	return raw;
};
