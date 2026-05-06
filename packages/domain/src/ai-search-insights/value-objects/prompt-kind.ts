/**
 * Taxonomy borrowed from Ahrefs Brand Radar so existing SEO playbooks map
 * cleanly. Used as a categorical filter in the dashboards (SoV by intent kind)
 * and as a hint to the LLM-judge to weight sentiment differently — a `branded`
 * mention with neutral sentiment is fine, but a `comparative` neutral hides
 * the fact we lost the comparison.
 */
export const PromptKinds = {
	/** Generic discovery: "best CRM for SaaS startups". */
	CATEGORY: 'category',
	/** Direct comparison: "patroltech vs tracktik". */
	COMPARATIVE: 'comparative',
	/** Buying intent: "where to buy a guard tour patrol system". */
	TRANSACTIONAL: 'transactional',
	/** Brand-specific: "is patroltech good?", "patroltech reviews". */
	BRANDED: 'branded',
} as const;

export type PromptKind = (typeof PromptKinds)[keyof typeof PromptKinds];

export const isPromptKind = (value: string): value is PromptKind =>
	value === PromptKinds.CATEGORY ||
	value === PromptKinds.COMPARATIVE ||
	value === PromptKinds.TRANSACTIONAL ||
	value === PromptKinds.BRANDED;
