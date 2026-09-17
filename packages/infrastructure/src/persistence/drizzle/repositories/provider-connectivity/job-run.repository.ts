import type { IdentityAccess } from '@rankpulse/domain';
import { ProviderConnectivity } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, between, desc, eq, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { projects, providerJobDefinitions, providerJobRuns } from '../../schema/index.js';

const isStatus = (value: string): value is ProviderConnectivity.JobRunStatus =>
	value === 'running' || value === 'succeeded' || value === 'failed' || value === 'skipped';

export class DrizzleJobRunRepository implements ProviderConnectivity.JobRunRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(run: ProviderConnectivity.ProviderJobRun): Promise<void> {
		await this.db
			.insert(providerJobRuns)
			.values({
				id: run.id,
				definitionId: run.definitionId,
				credentialId: run.credentialId,
				status: run.status,
				startedAt: run.startedAt,
				finishedAt: run.finishedAt,
				rawPayloadId: run.rawPayloadId,
				cacheHit: run.cacheHit,
				errorJson: run.error,
			})
			.onConflictDoUpdate({
				target: providerJobRuns.id,
				set: {
					status: run.status,
					finishedAt: run.finishedAt,
					rawPayloadId: run.rawPayloadId,
					cacheHit: run.cacheHit,
					errorJson: run.error,
				},
			});
	}

	async countExecutions(
		organizationId: IdentityAccess.OrganizationId,
		from: Date,
		to: Date,
	): Promise<ProviderConnectivity.RunExecutionCounts> {
		// Runs carry no organization of their own; they belong to one through
		// their definition. Joining keeps the org boundary enforced in SQL
		// rather than trusting the caller to filter afterwards.
		const [row] = await this.db
			.select({
				billed: sql<string>`COUNT(*) FILTER (WHERE ${providerJobRuns.cacheHit} = FALSE)`,
				fromCache: sql<string>`COUNT(*) FILTER (WHERE ${providerJobRuns.cacheHit} = TRUE)`,
			})
			.from(providerJobRuns)
			.innerJoin(providerJobDefinitions, eq(providerJobRuns.definitionId, providerJobDefinitions.id))
			.innerJoin(projects, eq(providerJobDefinitions.projectId, projects.id))
			.where(
				and(
					eq(projects.organizationId, organizationId),
					eq(providerJobRuns.status, 'succeeded'),
					between(providerJobRuns.startedAt, from, to),
				),
			);
		return { billed: Number(row?.billed ?? 0), fromCache: Number(row?.fromCache ?? 0) };
	}

	async findById(
		id: ProviderConnectivity.ProviderJobRunId,
	): Promise<ProviderConnectivity.ProviderJobRun | null> {
		const [row] = await this.db.select().from(providerJobRuns).where(eq(providerJobRuns.id, id)).limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForDefinition(
		definitionId: ProviderConnectivity.ProviderJobDefinitionId,
		limit = 50,
	): Promise<readonly ProviderConnectivity.ProviderJobRun[]> {
		const rows = await this.db
			.select()
			.from(providerJobRuns)
			.where(eq(providerJobRuns.definitionId, definitionId))
			.orderBy(desc(providerJobRuns.startedAt))
			.limit(limit);
		return rows.map((r) => this.toAggregate(r));
	}

	private toAggregate(row: typeof providerJobRuns.$inferSelect): ProviderConnectivity.ProviderJobRun {
		if (!isStatus(row.status)) {
			throw new InvalidInputError(`Stored job run has invalid status "${row.status}"`);
		}
		return ProviderConnectivity.ProviderJobRun.rehydrate({
			id: row.id as ProviderConnectivity.ProviderJobRunId,
			definitionId: row.definitionId as ProviderConnectivity.ProviderJobDefinitionId,
			credentialId: (row.credentialId as ProviderConnectivity.ProviderCredentialId | null) ?? null,
			status: row.status,
			startedAt: row.startedAt,
			finishedAt: row.finishedAt,
			rawPayloadId: (row.rawPayloadId as ProviderConnectivity.RawPayloadId | null) ?? null,
			cacheHit: row.cacheHit,
			error: row.errorJson ?? null,
		});
	}
}
