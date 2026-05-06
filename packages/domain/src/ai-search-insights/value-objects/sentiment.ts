export const Sentiments = {
	POSITIVE: 'positive',
	NEUTRAL: 'neutral',
	NEGATIVE: 'negative',
	MIXED: 'mixed',
} as const;

export type Sentiment = (typeof Sentiments)[keyof typeof Sentiments];

export const isSentiment = (value: string): value is Sentiment =>
	value === Sentiments.POSITIVE ||
	value === Sentiments.NEUTRAL ||
	value === Sentiments.NEGATIVE ||
	value === Sentiments.MIXED;
