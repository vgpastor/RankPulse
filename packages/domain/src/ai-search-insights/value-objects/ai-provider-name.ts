/**
 * Logical name of the LLM provider an answer was captured from. Decoupled
 * from the `ProviderId` of provider-connectivity (which is a registered
 * credential vendor) so the read-side queries don't need to join through
 * the credentials table to know "which LLM did this answer come from".
 */
export const AiProviderNames = {
	OPENAI: 'openai',
	ANTHROPIC: 'anthropic',
	PERPLEXITY: 'perplexity',
	GOOGLE_AI_STUDIO: 'google-ai-studio',
} as const;

export type AiProviderName = (typeof AiProviderNames)[keyof typeof AiProviderNames];

export const isAiProviderName = (value: string): value is AiProviderName =>
	value === AiProviderNames.OPENAI ||
	value === AiProviderNames.ANTHROPIC ||
	value === AiProviderNames.PERPLEXITY ||
	value === AiProviderNames.GOOGLE_AI_STUDIO;
