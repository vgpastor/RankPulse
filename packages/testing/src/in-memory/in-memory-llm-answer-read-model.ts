import type { AiSearchInsights, ProjectManagement } from '@rankpulse/domain';

interface AnswerRow {
	readonly id: string;
	readonly brandPromptId: string;
	readonly projectId: string;
	readonly aiProvider: AiSearchInsights.AiProviderName;
	readonly country: string;
	readonly language: string;
	readonly mentions: ReadonlyArray<{
		readonly brand: string;
		readonly isOwnBrand: boolean;
		readonly position: number;
		readonly citedUrl: string | null;
	}>;
	readonly citations: ReadonlyArray<{
		readonly url: string;
		readonly domain: string;
		readonly isOwnDomain: boolean;
	}>;
	readonly capturedAt: Date;
}

/**
 * Test stub: hydrate via `setRows()` and the four query methods walk the
 * in-memory list using the same semantics as the Drizzle implementation.
 */
export class InMemoryLlmAnswerReadModel implements AiSearchInsights.LlmAnswerReadModel {
	private rows: AnswerRow[] = [];

	setRows(rows: readonly AnswerRow[]): void {
		this.rows = [...rows];
	}

	async presenceForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<AiSearchInsights.AiSearchPresenceSummary> {
		const within = this.rows.filter((r) => this.matchProjectAndWindow(r, projectId, filter));
		const total = within.length;
		const own = within.filter((r) => r.mentions.some((m) => m.isOwnBrand));
		const ownCitations = within.flatMap((r) => r.citations.filter((c) => c.isOwnDomain));
		const ownPositions = within.flatMap((r) => r.mentions.filter((m) => m.isOwnBrand).map((m) => m.position));
		const competitorMentions = within.flatMap((r) => r.mentions.filter((m) => !m.isOwnBrand));
		return {
			totalAnswers: total,
			answersWithOwnMention: own.length,
			ownCitationCount: ownCitations.length,
			ownAvgPosition:
				ownPositions.length === 0 ? null : ownPositions.reduce((a, b) => a + b, 0) / ownPositions.length,
			competitorMentionCount: competitorMentions.length,
		};
	}

	async sovForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<readonly AiSearchInsights.AiSearchSovRow[]> {
		const within = this.rows.filter((r) => this.matchProjectAndWindow(r, projectId, filter));
		const totalsByLocale = new Map<string, number>();
		for (const r of within) {
			const k = `${r.aiProvider}|${r.country}|${r.language}`;
			totalsByLocale.set(k, (totalsByLocale.get(k) ?? 0) + 1);
		}
		const groups = new Map<
			string,
			{
				aiProvider: AiSearchInsights.AiProviderName;
				country: string;
				language: string;
				brand: string;
				isOwnBrand: boolean;
				answerIds: Set<string>;
				positions: number[];
				citationCount: number;
			}
		>();
		for (const r of within) {
			for (const m of r.mentions) {
				const k = `${r.aiProvider}|${r.country}|${r.language}|${m.brand}`;
				const existing = groups.get(k);
				const cited = m.citedUrl
					? r.citations.filter((c) => c.url === m.citedUrl && c.isOwnDomain).length
					: 0;
				if (existing) {
					existing.answerIds.add(r.id);
					existing.positions.push(m.position);
					existing.citationCount += cited;
					existing.isOwnBrand = existing.isOwnBrand || m.isOwnBrand;
				} else {
					groups.set(k, {
						aiProvider: r.aiProvider,
						country: r.country,
						language: r.language,
						brand: m.brand,
						isOwnBrand: m.isOwnBrand,
						answerIds: new Set([r.id]),
						positions: [m.position],
						citationCount: cited,
					});
				}
			}
		}
		const out: AiSearchInsights.AiSearchSovRow[] = [];
		for (const g of groups.values()) {
			const total = totalsByLocale.get(`${g.aiProvider}|${g.country}|${g.language}`) ?? 0;
			out.push({
				aiProvider: g.aiProvider,
				country: g.country,
				language: g.language,
				brand: g.brand,
				isOwnBrand: g.isOwnBrand,
				totalAnswers: total,
				answersWithMention: g.answerIds.size,
				avgPosition:
					g.positions.length === 0 ? null : g.positions.reduce((a, b) => a + b, 0) / g.positions.length,
				citationCount: g.citationCount,
			});
		}
		return out;
	}

	async citationsForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter & {
			onlyOwnDomains?: boolean;
			aiProvider?: AiSearchInsights.AiProviderName;
		},
	): Promise<readonly AiSearchInsights.AiSearchCitationRow[]> {
		const within = this.rows.filter(
			(r) =>
				this.matchProjectAndWindow(r, projectId, filter) &&
				(!filter.aiProvider || r.aiProvider === filter.aiProvider),
		);
		const groups = new Map<
			string,
			{
				url: string;
				domain: string;
				isOwnDomain: boolean;
				total: number;
				providers: Set<AiSearchInsights.AiProviderName>;
				firstSeen: Date;
				lastSeen: Date;
			}
		>();
		for (const r of within) {
			for (const c of r.citations) {
				if (filter.onlyOwnDomains && !c.isOwnDomain) continue;
				const k = c.url;
				const existing = groups.get(k);
				if (existing) {
					existing.total += 1;
					existing.providers.add(r.aiProvider);
					if (r.capturedAt < existing.firstSeen) existing.firstSeen = r.capturedAt;
					if (r.capturedAt > existing.lastSeen) existing.lastSeen = r.capturedAt;
				} else {
					groups.set(k, {
						url: c.url,
						domain: c.domain,
						isOwnDomain: c.isOwnDomain,
						total: 1,
						providers: new Set([r.aiProvider]),
						firstSeen: r.capturedAt,
						lastSeen: r.capturedAt,
					});
				}
			}
		}
		return [...groups.values()]
			.map((g) => ({
				url: g.url,
				domain: g.domain,
				isOwnDomain: g.isOwnDomain,
				totalCitations: g.total,
				providers: [...g.providers],
				firstSeenAt: g.firstSeen,
				lastSeenAt: g.lastSeen,
			}))
			.sort((a, b) => b.totalCitations - a.totalCitations);
	}

	async sovDailyForPrompt(
		brandPromptId: AiSearchInsights.BrandPromptId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<readonly AiSearchInsights.AiSearchSovDailyPoint[]> {
		const within = this.rows.filter(
			(r) => r.brandPromptId === brandPromptId && r.capturedAt >= filter.from && r.capturedAt <= filter.to,
		);
		const buckets = new Map<string, { total: number; withOwn: number }>();
		for (const r of within) {
			const day = r.capturedAt.toISOString().slice(0, 10);
			const cell = buckets.get(day) ?? { total: 0, withOwn: 0 };
			cell.total += 1;
			if (r.mentions.some((m) => m.isOwnBrand)) cell.withOwn += 1;
			buckets.set(day, cell);
		}
		return [...buckets.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([day, v]) => ({ day, totalAnswers: v.total, answersWithOwnMention: v.withOwn }));
	}

	async competitiveMatrixForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<readonly AiSearchInsights.AiSearchMatrixCell[]> {
		const sov = await this.sovForProject(projectId, filter);
		return sov.map((r) => ({
			aiProvider: r.aiProvider,
			country: r.country,
			language: r.language,
			brand: r.brand,
			isOwnBrand: r.isOwnBrand,
			totalAnswers: r.totalAnswers,
			answersWithMention: r.answersWithMention,
			avgPosition: r.avgPosition,
			mentionRate: r.totalAnswers === 0 ? 0 : r.answersWithMention / r.totalAnswers,
		}));
	}

	async weeklySovDeltaForProject(
		projectId: ProjectManagement.ProjectId,
		asOf: Date,
	): Promise<readonly AiSearchInsights.AiSearchWeeklySovDelta[]> {
		const thisWeekStart = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);
		const lastWeekStart = new Date(asOf.getTime() - 14 * 24 * 60 * 60 * 1000);
		const groups = new Map<
			string,
			{
				aiProvider: AiSearchInsights.AiProviderName;
				country: string;
				language: string;
				thisTotal: number;
				thisOwn: number;
				lastTotal: number;
				lastOwn: number;
			}
		>();
		for (const r of this.rows) {
			if (r.projectId !== projectId) continue;
			if (r.capturedAt < lastWeekStart || r.capturedAt > asOf) continue;
			const key = `${r.aiProvider}|${r.country}|${r.language}`;
			const cell = groups.get(key) ?? {
				aiProvider: r.aiProvider,
				country: r.country,
				language: r.language,
				thisTotal: 0,
				thisOwn: 0,
				lastTotal: 0,
				lastOwn: 0,
			};
			const own = r.mentions.some((m) => m.isOwnBrand);
			if (r.capturedAt >= thisWeekStart) {
				cell.thisTotal += 1;
				if (own) cell.thisOwn += 1;
			} else {
				cell.lastTotal += 1;
				if (own) cell.lastOwn += 1;
			}
			groups.set(key, cell);
		}
		return [...groups.values()].map((g) => {
			const thisRate = g.thisTotal === 0 ? 0 : g.thisOwn / g.thisTotal;
			const lastRate = g.lastTotal === 0 ? 0 : g.lastOwn / g.lastTotal;
			return {
				aiProvider: g.aiProvider,
				country: g.country,
				language: g.language,
				thisWeekTotal: g.thisTotal,
				thisWeekOwnMentions: g.thisOwn,
				lastWeekTotal: g.lastTotal,
				lastWeekOwnMentions: g.lastOwn,
				thisWeekRate: thisRate,
				lastWeekRate: lastRate,
				relativeDelta: lastRate === 0 ? null : (thisRate - lastRate) / lastRate,
			};
		});
	}

	async ownCitationStreaksForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<readonly AiSearchInsights.AiSearchOwnCitationStreak[]> {
		// Build per (provider, locale, url) → set of YYYY-MM-DD days where the
		// URL was cited. Then walk consecutive runs to find the longest streak.
		const presence = new Map<
			string,
			{
				url: string;
				domain: string;
				aiProvider: AiSearchInsights.AiProviderName;
				country: string;
				language: string;
				days: Set<string>;
			}
		>();
		const lastDayPerLocale = new Map<string, string>();
		for (const r of this.rows) {
			if (r.projectId !== projectId) continue;
			if (r.capturedAt < filter.from || r.capturedAt > filter.to) continue;
			const day = r.capturedAt.toISOString().slice(0, 10);
			const localeKey = `${r.aiProvider}|${r.country}|${r.language}`;
			const prevLast = lastDayPerLocale.get(localeKey);
			if (!prevLast || day > prevLast) lastDayPerLocale.set(localeKey, day);
			for (const c of r.citations) {
				if (!c.isOwnDomain) continue;
				const k = `${r.aiProvider}|${r.country}|${r.language}|${c.url}`;
				const cell = presence.get(k) ?? {
					url: c.url,
					domain: c.domain,
					aiProvider: r.aiProvider,
					country: r.country,
					language: r.language,
					days: new Set<string>(),
				};
				cell.days.add(day);
				presence.set(k, cell);
			}
		}
		return [...presence.values()].map((p) => {
			const sorted = [...p.days].sort();
			let longest = 0;
			let current = 0;
			let prev: string | null = null;
			let lastDayInStreak = sorted[0] ?? '';
			for (const day of sorted) {
				if (prev === null) {
					current = 1;
				} else {
					const prevDate = new Date(`${prev}T00:00:00Z`).getTime();
					const dayDate = new Date(`${day}T00:00:00Z`).getTime();
					const oneDayMs = 24 * 60 * 60 * 1000;
					current = dayDate - prevDate === oneDayMs ? current + 1 : 1;
				}
				if (current > longest) {
					longest = current;
					lastDayInStreak = day;
				}
				prev = day;
			}
			const lastCaptureDay = lastDayPerLocale.get(`${p.aiProvider}|${p.country}|${p.language}`);
			return {
				url: p.url,
				domain: p.domain,
				aiProvider: p.aiProvider,
				country: p.country,
				language: p.language,
				streakDays: longest,
				lastSeenAt: new Date(`${lastDayInStreak}T00:00:00Z`),
				currentlyCited: lastCaptureDay !== undefined && p.days.has(lastCaptureDay),
			};
		});
	}

	async positionLeadsForProject(
		projectId: ProjectManagement.ProjectId,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): Promise<readonly AiSearchInsights.AiSearchPositionLead[]> {
		const ownPositionsByLocale = new Map<string, number[]>();
		const competitorPositionsByLocaleBrand = new Map<string, { brand: string; positions: number[] }>();
		for (const r of this.rows) {
			if (r.projectId !== projectId) continue;
			if (r.capturedAt < filter.from || r.capturedAt > filter.to) continue;
			const localeKey = `${r.aiProvider}|${r.country}|${r.language}`;
			for (const m of r.mentions) {
				if (m.isOwnBrand) {
					const list = ownPositionsByLocale.get(localeKey) ?? [];
					list.push(m.position);
					ownPositionsByLocale.set(localeKey, list);
				} else {
					const k = `${localeKey}|${m.brand}`;
					const cell = competitorPositionsByLocaleBrand.get(k) ?? { brand: m.brand, positions: [] };
					cell.positions.push(m.position);
					competitorPositionsByLocaleBrand.set(k, cell);
				}
			}
		}
		const out: AiSearchInsights.AiSearchPositionLead[] = [];
		for (const [k, cell] of competitorPositionsByLocaleBrand.entries()) {
			const [aiProvider, country, language] = k.split('|') as [
				AiSearchInsights.AiProviderName,
				string,
				string,
			];
			const ownList = ownPositionsByLocale.get(`${aiProvider}|${country}|${language}`) ?? [];
			const ownAvg = ownList.length === 0 ? null : ownList.reduce((a, b) => a + b, 0) / ownList.length;
			const compAvg =
				cell.positions.length === 0
					? null
					: cell.positions.reduce((a, b) => a + b, 0) / cell.positions.length;
			out.push({
				aiProvider,
				country,
				language,
				ownAvgPosition: ownAvg,
				competitorBrand: cell.brand,
				competitorAvgPosition: compAvg,
			});
		}
		return out;
	}

	private matchProjectAndWindow(
		row: AnswerRow,
		projectId: string,
		filter: AiSearchInsights.AiSearchReadModelFilter,
	): boolean {
		return row.projectId === projectId && row.capturedAt >= filter.from && row.capturedAt <= filter.to;
	}
}
