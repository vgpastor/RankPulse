import { ProjectManagement } from '@rankpulse/domain';
import { desc, eq, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { domainAuthorityObservations } from '../../schema/index.js';
import { toDate } from '../../utils/postgres-js-coercions.js';

type Row = typeof domainAuthorityObservations.$inferSelect;

const toAggregate = (row: Row): ProjectManagement.DomainAuthorityObservation =>
	ProjectManagement.DomainAuthorityObservation.rehydrate({
		id: row.id as ProjectManagement.DomainAuthorityObservationId,
		projectId: row.projectId as ProjectManagement.ProjectId,
		domain: row.domain,
		observedAt: toDate(row.observedAt),
		metrics: {
			totalBacklinks: row.backlinksTotal,
			referringDomains: row.referringDomains,
			referringMainDomains: row.referringMainDomains,
			referringPages: row.referringPages,
			brokenBacklinks: row.brokenBacklinks,
			spamScore: row.spamScore,
			rank: row.rank,
		},
		rawPayloadId: row.rawPayloadId,
	});

export class DrizzleDomainAuthorityObservationRepository
	implements ProjectManagement.DomainAuthorityObservationRepository
{
	constructor(private readonly db: DrizzleDatabase) {}

	async save(o: ProjectManagement.DomainAuthorityObservation): Promise<void> {
		const m = o.metrics;
		await this.db
			.insert(domainAuthorityObservations)
			.values({
				id: o.id,
				projectId: o.projectId,
				domain: o.domain,
				observedAt: o.observedAt,
				backlinksTotal: m.totalBacklinks,
				referringDomains: m.referringDomains,
				referringMainDomains: m.referringMainDomains,
				referringPages: m.referringPages,
				brokenBacklinks: m.brokenBacklinks,
				spamScore: m.spamScore,
				rank: m.rank,
				rawPayloadId: o.rawPayloadId,
			})
			// A second fetch on the same day replaces the first: the later
			// reading is the fresher one and there is no reason to keep both.
			.onConflictDoUpdate({
				target: [
					domainAuthorityObservations.projectId,
					domainAuthorityObservations.domain,
					domainAuthorityObservations.observedAt,
				],
				set: {
					backlinksTotal: sql`excluded.backlinks_total`,
					referringDomains: sql`excluded.referring_domains`,
					referringMainDomains: sql`excluded.referring_main_domains`,
					referringPages: sql`excluded.referring_pages`,
					brokenBacklinks: sql`excluded.broken_backlinks`,
					spamScore: sql`excluded.spam_score`,
					rank: sql`excluded.rank`,
					rawPayloadId: sql`excluded.raw_payload_id`,
				},
			});
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
		limit: number,
	): Promise<readonly ProjectManagement.DomainAuthorityObservation[]> {
		const rows = await this.db
			.select()
			.from(domainAuthorityObservations)
			.where(eq(domainAuthorityObservations.projectId, projectId))
			.orderBy(desc(domainAuthorityObservations.observedAt))
			.limit(limit);
		return rows.map(toAggregate);
	}
}
