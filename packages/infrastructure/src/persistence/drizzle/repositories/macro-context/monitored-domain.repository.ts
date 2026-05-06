import { type IdentityAccess, MacroContext, type ProjectManagement } from '@rankpulse/domain';
import { ConflictError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { monitoredDomains } from '../../schema/index.js';

const UNIQUE_TUPLE_CONSTRAINT = 'monitored_domains_project_domain_unique';

const isUniqueViolation = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: string; constraint_name?: string; constraint?: string };
	if (e.code !== '23505') return false;
	const constraint = e.constraint_name ?? e.constraint;
	return constraint === UNIQUE_TUPLE_CONSTRAINT;
};

export class DrizzleMonitoredDomainRepository implements MacroContext.MonitoredDomainRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(md: MacroContext.MonitoredDomain): Promise<void> {
		try {
			await this.db
				.insert(monitoredDomains)
				.values({
					id: md.id,
					organizationId: md.organizationId,
					projectId: md.projectId,
					domain: md.domain.value,
					credentialId: md.credentialId,
					addedAt: md.addedAt,
					removedAt: md.removedAt,
				})
				.onConflictDoUpdate({
					target: monitoredDomains.id,
					set: {
						domain: md.domain.value,
						credentialId: md.credentialId,
						removedAt: md.removedAt,
					},
				});
		} catch (err) {
			if (isUniqueViolation(err)) {
				throw new ConflictError(
					`Monitored domain "${md.domain.value}" is already registered for project ${md.projectId}`,
				);
			}
			throw err;
		}
	}

	async findById(id: MacroContext.MonitoredDomainId): Promise<MacroContext.MonitoredDomain | null> {
		const [row] = await this.db.select().from(monitoredDomains).where(eq(monitoredDomains.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findByProjectAndDomain(
		projectId: ProjectManagement.ProjectId,
		domain: string,
	): Promise<MacroContext.MonitoredDomain | null> {
		const canonical = MacroContext.DomainName.create(domain);
		const [row] = await this.db
			.select()
			.from(monitoredDomains)
			.where(and(eq(monitoredDomains.projectId, projectId), eq(monitoredDomains.domain, canonical.value)))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly MacroContext.MonitoredDomain[]> {
		const rows = await this.db
			.select()
			.from(monitoredDomains)
			.where(eq(monitoredDomains.projectId, projectId))
			.orderBy(desc(monitoredDomains.addedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	async listForOrganization(
		orgId: IdentityAccess.OrganizationId,
	): Promise<readonly MacroContext.MonitoredDomain[]> {
		const rows = await this.db
			.select()
			.from(monitoredDomains)
			.where(eq(monitoredDomains.organizationId, orgId))
			.orderBy(desc(monitoredDomains.addedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof monitoredDomains.$inferSelect): MacroContext.MonitoredDomain {
		return MacroContext.MonitoredDomain.rehydrate({
			id: row.id as MacroContext.MonitoredDomainId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			domain: MacroContext.DomainName.create(row.domain),
			credentialId: row.credentialId,
			addedAt: row.addedAt,
			removedAt: row.removedAt,
		});
	}
}
