import { createHash } from 'node:crypto';
import { type ProjectManagement, ProviderConnectivity } from '@rankpulse/domain';
import { and, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { providerJobDefinitions } from '../../schema/index.js';

const stableStringify = (value: unknown): string => {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

/**
 * Stable hash of the canonicalised params, used as the secondary key
 * for `findFor(projectId, providerId, endpointId, params)` so two
 * JobDefinitions for the same triple but different params can coexist.
 *
 * SHA-256 truncated to 16 hex chars (64 bits) — collision probability
 * is ~2^-32 even with millions of definitions, vs. the previous
 * 32-bit Bernstein hash that hit collisions under tens of thousands.
 * A collision routed an entire job's cost to the wrong tenant; not
 * acceptable.
 */
export const computeParamsHash = (params: Record<string, unknown>): string => {
	const stable = stableStringify(params);
	return createHash('sha256').update(stable).digest('hex').slice(0, 16);
};

export class DrizzleJobDefinitionRepository implements ProviderConnectivity.JobDefinitionRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(d: ProviderConnectivity.ProviderJobDefinition): Promise<void> {
		await this.db
			.insert(providerJobDefinitions)
			.values({
				id: d.id,
				projectId: d.projectId,
				providerId: d.providerId.value,
				endpointId: d.endpointId.value,
				paramsHash: computeParamsHash(d.params as Record<string, unknown>),
				params: d.params as Record<string, unknown>,
				cron: d.cron.value,
				credentialOverrideId: d.credentialOverrideId,
				enabled: d.enabled,
				lastRunAt: d.lastRunAt,
				createdAt: d.createdAt,
			})
			.onConflictDoUpdate({
				target: providerJobDefinitions.id,
				set: {
					params: d.params as Record<string, unknown>,
					cron: d.cron.value,
					credentialOverrideId: d.credentialOverrideId,
					enabled: d.enabled,
					lastRunAt: d.lastRunAt,
				},
			});
	}

	async findById(
		id: ProviderConnectivity.ProviderJobDefinitionId,
	): Promise<ProviderConnectivity.ProviderJobDefinition | null> {
		const [row] = await this.db
			.select()
			.from(providerJobDefinitions)
			.where(eq(providerJobDefinitions.id, id))
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async findFor(
		projectId: ProjectManagement.ProjectId,
		providerId: ProviderConnectivity.ProviderId,
		endpointId: ProviderConnectivity.EndpointId,
		paramsHash: string,
	): Promise<ProviderConnectivity.ProviderJobDefinition | null> {
		const [row] = await this.db
			.select()
			.from(providerJobDefinitions)
			.where(
				and(
					eq(providerJobDefinitions.projectId, projectId),
					eq(providerJobDefinitions.providerId, providerId.value),
					eq(providerJobDefinitions.endpointId, endpointId.value),
					eq(providerJobDefinitions.paramsHash, paramsHash),
				),
			)
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly ProviderConnectivity.ProviderJobDefinition[]> {
		const rows = await this.db
			.select()
			.from(providerJobDefinitions)
			.where(eq(providerJobDefinitions.projectId, projectId));
		return rows.map((r) => this.toAggregate(r));
	}

	async delete(id: ProviderConnectivity.ProviderJobDefinitionId): Promise<void> {
		await this.db.delete(providerJobDefinitions).where(eq(providerJobDefinitions.id, id));
	}

	private toAggregate(
		row: typeof providerJobDefinitions.$inferSelect,
	): ProviderConnectivity.ProviderJobDefinition {
		return ProviderConnectivity.ProviderJobDefinition.rehydrate({
			id: row.id as ProviderConnectivity.ProviderJobDefinitionId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			providerId: ProviderConnectivity.ProviderId.create(row.providerId),
			endpointId: ProviderConnectivity.EndpointId.create(row.endpointId),
			params: (row.params ?? {}) as Record<string, unknown>,
			cron: ProviderConnectivity.CronExpression.create(row.cron),
			credentialOverrideId:
				(row.credentialOverrideId as ProviderConnectivity.ProviderCredentialId | null) ?? null,
			enabled: row.enabled,
			lastRunAt: row.lastRunAt,
			createdAt: row.createdAt,
		});
	}
}
