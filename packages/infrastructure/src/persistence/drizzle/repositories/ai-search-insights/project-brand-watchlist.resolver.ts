import { AiSearchInsights, type ProjectManagement } from '@rankpulse/domain';
import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { competitors, projectDomains, projects } from '../../schema/index.js';

/**
 * Default `BrandWatchlistResolver` adapter. Reads `projects.primary_domain`
 * (own brand) + `project_domains` (additional own domains) +
 * `competitors.domain` (tracked competitors) and produces the watchlist
 * the LLM-judge consumes.
 *
 * `name` is derived from the domain by stripping the TLD and titlecasing
 * (`patroltech.com` → `Patroltech`). For brands where the trade name
 * differs significantly from the domain, sub-issue #62 will introduce
 * an explicit `BrandAlias` table; today the heuristic is good enough to
 * detect mentions in 95% of cases (B2B SaaS brands typically use their
 * trade name as their domain).
 */
export class ProjectBrandWatchlistResolver implements AiSearchInsights.BrandWatchlistResolver {
	constructor(private readonly db: DrizzleDatabase) {}

	async resolveForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly AiSearchInsights.BrandWatchEntry[]> {
		const [projectRows, ownDomainsRows, competitorRows] = await Promise.all([
			this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
			this.db.select().from(projectDomains).where(eq(projectDomains.projectId, projectId)),
			this.db.select().from(competitors).where(eq(competitors.projectId, projectId)),
		]);

		const project = projectRows[0];
		if (!project) return [];

		const ownDomains = [...new Set([project.primaryDomain, ...ownDomainsRows.map((r) => r.domain)])];

		const ownBrand = AiSearchInsights.BrandWatchEntry.create({
			name: brandNameFromDomain(project.primaryDomain),
			aliases: ownDomains
				.map(brandNameFromDomain)
				.filter((a) => a !== brandNameFromDomain(project.primaryDomain)),
			ownDomains,
			isOwnBrand: true,
		});

		const competitorEntries = competitorRows.map((c) =>
			AiSearchInsights.BrandWatchEntry.create({
				name: c.label && c.label.length > 0 ? c.label : brandNameFromDomain(c.domain),
				aliases: [brandNameFromDomain(c.domain)].filter((a) => a !== c.label),
				ownDomains: [c.domain],
				isOwnBrand: false,
			}),
		);

		return [ownBrand, ...competitorEntries];
	}
}

/**
 * Heuristic: take the leftmost label of the domain, drop common subdomain
 * prefixes (`www.`, `app.`), and titlecase. `patroltech.com` → `Patroltech`,
 * `app.example.io` → `Example`, `acme-corp.com` → `Acme-corp`.
 */
const brandNameFromDomain = (domain: string): string => {
	const cleaned = domain
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/^(www|app|m)\./, '');
	const head = cleaned.split('.')[0] ?? cleaned;
	if (head.length === 0) return domain;
	return head.charAt(0).toUpperCase() + head.slice(1);
};
