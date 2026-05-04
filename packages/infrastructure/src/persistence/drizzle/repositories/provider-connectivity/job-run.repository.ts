import { ProviderConnectivity } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { providerJobRuns } from '../../schema/index.js';

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
				errorJson: run.error,
			})
			.onConflictDoUpdate({
				target: providerJobRuns.id,
				set: {
					status: run.status,
					finishedAt: run.finishedAt,
					rawPayloadId: run.rawPayloadId,
					errorJson: run.error,
				},
			});
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
			error: row.errorJson ?? null,
		});
	}
}
