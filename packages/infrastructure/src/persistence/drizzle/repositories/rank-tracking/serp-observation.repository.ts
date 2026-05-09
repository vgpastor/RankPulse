import { type ProjectManagement, RankTracking } from '@rankpulse/domain';
import { InvalidInputError } from '@rankpulse/shared';
import { and, desc, eq, gte, notInArray, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../../client.js';
import { serpObservations } from '../../schema/index.js';

// postgres-js driver returns either `{rows: [...]}` or the rows array
// directly depending on the call site; unwrap to a typed array regardless.
const unwrap = <T>(rows: unknown): T[] => ((rows as { rows?: unknown[] }).rows ?? (rows as unknown[])) as T[];

export class DrizzleSerpObservationRepository implements RankTracking.SerpObservationRepository {
	constructor(private readonly db: DrizzleDatabase) {}

	async save(o: RankTracking.SerpObservation): Promise<void> {
		// Idempotent overwrite: delete the previous snapshot for the same
		// (project, keyword, locale, device, day) before inserting. The
		// aggregate's `record()` already truncates `observedAt` to start-of-day
		// UTC, so this DELETE matches at most one prior snapshot.
		await this.db.transaction(async (tx) => {
			await tx
				.delete(serpObservations)
				.where(
					and(
						eq(serpObservations.observedAt, o.observedAt),
						eq(serpObservations.projectId, o.projectId),
						eq(serpObservations.phrase, o.phrase),
						eq(serpObservations.country, o.country),
						eq(serpObservations.language, o.language),
						eq(serpObservations.device, o.device),
					),
				);
			if (o.results.length === 0) return;
			await tx.insert(serpObservations).values(
				o.results.map((r) => ({
					observedAt: o.observedAt,
					projectId: o.projectId,
					phrase: o.phrase,
					country: o.country,
					language: o.language,
					device: o.device,
					rank: r.rank,
					domain: r.domain,
					url: r.url,
					title: r.title,
					sourceProvider: o.sourceProvider,
					rawPayloadId: o.rawPayloadId,
				})),
			);
		});
	}

	async listLatestForProject(
		projectId: ProjectManagement.ProjectId,
		windowDays: number,
		filter?: RankTracking.SerpMapQueryFilter,
	): Promise<readonly RankTracking.SerpObservation[]> {
		// Latest snapshot per (project, phrase, country, language, device)
		// in the rolling window — uses a CTE to find the max observed_at per
		// tuple, then joins back to materialise the full top-N. This keeps
		// the read query single-trip even when the window has multiple daily
		// snapshots.
		const since = sql<Date>`now() - (${windowDays}::int * interval '1 day')`;
		const wherePhrase = filter?.phrase ? sql`AND phrase = ${filter.phrase}` : sql``;
		const whereCountry = filter?.country ? sql`AND country = ${filter.country}` : sql``;
		const whereLanguage = filter?.language ? sql`AND language = ${filter.language}` : sql``;
		const result = await this.db.execute(sql<{
			observed_at: Date;
			project_id: string;
			phrase: string;
			country: string;
			language: string;
			device: string;
			rank: number;
			domain: string;
			url: string | null;
			title: string | null;
			source_provider: string;
			raw_payload_id: string | null;
		}>`
			WITH latest AS (
				SELECT project_id, phrase, country, language, device, MAX(observed_at) AS observed_at
				FROM serp_observations
				WHERE project_id = ${projectId}
					AND observed_at >= ${since}
					${wherePhrase}
					${whereCountry}
					${whereLanguage}
				GROUP BY project_id, phrase, country, language, device
			)
			SELECT s.observed_at, s.project_id, s.phrase, s.country, s.language, s.device,
			       s.rank, s.domain, s.url, s.title, s.source_provider, s.raw_payload_id
			FROM serp_observations s
			JOIN latest l
				ON s.project_id = l.project_id
				AND s.phrase = l.phrase
				AND s.country = l.country
				AND s.language = l.language
				AND s.device = l.device
				AND s.observed_at = l.observed_at
			ORDER BY s.phrase ASC, s.country ASC, s.language ASC, s.device ASC, s.rank ASC
		`);
		type Row = {
			observed_at: Date;
			project_id: string;
			phrase: string;
			country: string;
			language: string;
			device: string;
			rank: number;
			domain: string;
			url: string | null;
			title: string | null;
			source_provider: string;
			raw_payload_id: string | null;
		};
		const rows = unwrap<Row>(result);

		const grouped = new Map<string, Row[]>();
		for (const row of rows) {
			const key = `${row.phrase}|${row.country}|${row.language}|${row.device}`;
			const list = grouped.get(key) ?? [];
			list.push(row);
			grouped.set(key, list);
		}

		const out: RankTracking.SerpObservation[] = [];
		for (const [, group] of grouped) {
			const first = group[0];
			if (!first) continue;
			if (!RankTracking.isDevice(first.device)) {
				throw new InvalidInputError(`Stored serp_observation has invalid device "${first.device}"`);
			}
			out.push(
				RankTracking.SerpObservation.rehydrate({
					id: `${first.observed_at.toISOString()}#${first.project_id}#${first.phrase}` as RankTracking.SerpObservationId,
					projectId: first.project_id as ProjectManagement.ProjectId,
					phrase: first.phrase,
					country: first.country,
					language: first.language,
					device: first.device,
					results: group.map((r: Row) =>
						RankTracking.SerpResult.create({
							rank: r.rank,
							domain: r.domain,
							url: r.url,
							title: r.title,
						}),
					),
					sourceProvider: first.source_provider,
					rawPayloadId: first.raw_payload_id,
					observedAt: first.observed_at,
				}),
			);
		}
		return out;
	}

	async listCompetitorSuggestions(
		projectId: ProjectManagement.ProjectId,
		windowDays: number,
		minDistinctKeywords: number,
		excludeDomains: readonly string[],
	): Promise<readonly RankTracking.CompetitorSuggestionRow[]> {
		const since = sql<Date>`now() - (${windowDays}::int * interval '1 day')`;
		const conditions = [
			eq(serpObservations.projectId, projectId),
			gte(serpObservations.observedAt, since),
			sql`${serpObservations.rank} <= 10`,
		];
		if (excludeDomains.length > 0) {
			conditions.push(notInArray(serpObservations.domain, [...excludeDomains]));
		}

		const rows = await this.db
			.select({
				domain: serpObservations.domain,
				distinctKeywords: sql<number>`COUNT(DISTINCT ${serpObservations.phrase})::int`,
				totalAppearances: sql<number>`COUNT(*)::int`,
				bestRank: sql<number>`MIN(${serpObservations.rank})::int`,
				sampleUrl: sql<
					string | null
				>`(ARRAY_AGG(${serpObservations.url} ORDER BY ${serpObservations.rank} ASC) FILTER (WHERE ${serpObservations.url} IS NOT NULL))[1]`,
			})
			.from(serpObservations)
			.where(and(...conditions))
			.groupBy(serpObservations.domain)
			.having(sql`COUNT(DISTINCT ${serpObservations.phrase}) >= ${minDistinctKeywords}`)
			.orderBy(desc(sql`COUNT(DISTINCT ${serpObservations.phrase})`), desc(sql`COUNT(*)`))
			.limit(50);

		return rows.map((r) => ({
			domain: r.domain,
			distinctKeywords: r.distinctKeywords,
			totalAppearances: r.totalAppearances,
			bestRank: r.bestRank,
			sampleUrl: r.sampleUrl,
		}));
	}
}
