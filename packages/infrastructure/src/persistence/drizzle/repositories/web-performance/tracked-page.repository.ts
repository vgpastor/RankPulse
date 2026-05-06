import { type IdentityAccess, type ProjectManagement, WebPerformance } from '@rankpulse/domain';
import { ConflictError } from '@rankpulse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { trackedPages } from '../../schema/index.js';
import { DrizzleRepository } from '../_base.js';

const UNIQUE_TUPLE_CONSTRAINT = 'tracked_pages_project_url_strategy_unique';

const isUniqueViolation = (err: unknown): boolean => {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: string; constraint_name?: string; constraint?: string };
	if (e.code !== '23505') return false;
	const constraint = e.constraint_name ?? e.constraint;
	return constraint === UNIQUE_TUPLE_CONSTRAINT;
};

type TrackedPageRow = typeof trackedPages.$inferSelect;

export class DrizzleTrackedPageRepository
	extends DrizzleRepository<WebPerformance.TrackedPage, TrackedPageRow>
	implements WebPerformance.TrackedPageRepository
{
	constructor(db: DrizzleDatabase) {
		super(db, trackedPages);
	}

	async save(page: WebPerformance.TrackedPage): Promise<void> {
		try {
			await this.db
				.insert(trackedPages)
				.values({
					id: page.id,
					organizationId: page.organizationId,
					projectId: page.projectId,
					url: page.url.value,
					strategy: page.strategy,
					addedAt: page.addedAt,
				})
				.onConflictDoUpdate({
					target: trackedPages.id,
					set: { url: page.url.value, strategy: page.strategy },
				});
		} catch (err) {
			if (isUniqueViolation(err)) {
				throw new ConflictError(
					`Tracked page (${page.projectId}, ${page.url.value}, ${page.strategy}) already exists`,
				);
			}
			throw err;
		}
	}

	// findById inherited from DrizzleRepository<TAggregate, TRow>.

	async findByTuple(
		projectId: ProjectManagement.ProjectId,
		url: WebPerformance.PageUrl,
		strategy: WebPerformance.PageSpeedStrategy,
	): Promise<WebPerformance.TrackedPage | null> {
		const [row] = await this.db
			.select()
			.from(trackedPages)
			.where(
				and(
					eq(trackedPages.projectId, projectId),
					eq(trackedPages.url, url.value),
					eq(trackedPages.strategy, strategy),
				),
			)
			.limit(1);
		return row ? this.toAggregate(row) : null;
	}

	async listForProject(
		projectId: ProjectManagement.ProjectId,
	): Promise<readonly WebPerformance.TrackedPage[]> {
		const rows = await this.db
			.select()
			.from(trackedPages)
			.where(eq(trackedPages.projectId, projectId))
			.orderBy(desc(trackedPages.addedAt));
		return rows.map((r) => this.toAggregate(r));
	}

	async delete(id: WebPerformance.TrackedPageId): Promise<void> {
		await this.db.delete(trackedPages).where(eq(trackedPages.id, id));
	}

	protected toAggregate(row: TrackedPageRow): WebPerformance.TrackedPage {
		if (!WebPerformance.isPageSpeedStrategy(row.strategy)) {
			throw new Error(`Stored tracked page has invalid strategy "${row.strategy}"`);
		}
		return WebPerformance.TrackedPage.rehydrate({
			id: row.id as WebPerformance.TrackedPageId,
			organizationId: row.organizationId as IdentityAccess.OrganizationId,
			projectId: row.projectId as ProjectManagement.ProjectId,
			url: WebPerformance.PageUrl.create(row.url),
			strategy: row.strategy,
			addedAt: row.addedAt,
		});
	}
}
