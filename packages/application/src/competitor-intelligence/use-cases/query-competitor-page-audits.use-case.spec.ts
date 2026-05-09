import { CompetitorIntelligence, type IdentityAccess, type ProjectManagement } from '@rankpulse/domain';
import type { Uuid } from '@rankpulse/shared';
import {
	aProject,
	InMemoryCompetitorPageAuditRepository,
	InMemoryProjectRepository,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryCompetitorPageAuditsUseCase } from './query-competitor-page-audits.use-case.js';

const orgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;

const buildAudit = (
	overrides: Partial<{
		projectId: ProjectManagement.ProjectId;
		url: string;
		observedAt: Date;
		title: string | null;
	}>,
): CompetitorIntelligence.CompetitorPageAudit =>
	CompetitorIntelligence.CompetitorPageAudit.record({
		id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as CompetitorIntelligence.CompetitorPageAuditId,
		observedAt: overrides.observedAt ?? new Date('2026-05-09T06:00:00Z'),
		projectId: overrides.projectId ?? ('p' as Uuid as ProjectManagement.ProjectId),
		competitorDomain: 'rondacontrol.es',
		url: overrides.url ?? 'https://rondacontrol.es/landing',
		statusCode: 200,
		statusMessage: 'OK',
		fetchTimeMs: 432,
		pageSizeBytes: 89_000,
		title: overrides.title ?? 'Competitor landing',
		metaDescription: null,
		h1: 'Welcome',
		h2Count: 4,
		h3Count: 7,
		wordCount: 1250,
		plainTextSizeBytes: 8_500,
		internalLinksCount: 33,
		externalLinksCount: 5,
		hasSchemaOrg: true,
		schemaTypes: ['Organization'],
		canonicalUrl: null,
		redirectUrl: null,
		lcpMs: 2_100,
		cls: 0.05,
		ttfbMs: 180,
		domSize: 850,
		isAmp: false,
		isJavascript: true,
		isHttps: true,
		hreflangCount: 2,
		ogTagsCount: 6,
		sourceProvider: 'dataforseo',
		rawPayloadId: null,
		observedAtProvider: null,
	});

describe('QueryCompetitorPageAuditsUseCase', () => {
	let projects: InMemoryProjectRepository;
	let audits: InMemoryCompetitorPageAuditRepository;
	let project: ProjectManagement.Project;
	let useCase: QueryCompetitorPageAuditsUseCase;

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		audits = new InMemoryCompetitorPageAuditRepository();
		project = aProject({ organizationId: orgId });
		await projects.save(project);
		useCase = new QueryCompetitorPageAuditsUseCase(projects, audits);
	});

	it('returns the latest audit per URL when no url filter is supplied', async () => {
		await audits.saveAll([
			buildAudit({
				projectId: project.id,
				url: 'https://rondacontrol.es/a',
				observedAt: new Date('2026-05-08T06:00:00Z'),
				title: 'a-old',
			}),
			buildAudit({
				projectId: project.id,
				url: 'https://rondacontrol.es/a',
				observedAt: new Date('2026-05-09T06:00:00Z'),
				title: 'a-new',
			}),
			buildAudit({
				projectId: project.id,
				url: 'https://rondacontrol.es/b',
				observedAt: new Date('2026-05-09T05:00:00Z'),
				title: 'b',
			}),
		]);
		const result = await useCase.execute({
			projectId: project.id,
			competitorDomain: 'rondacontrol.es',
		});
		expect(result.rows).toHaveLength(2);
		const byUrl = new Map(result.rows.map((r) => [r.url, r] as const));
		expect(byUrl.get('https://rondacontrol.es/a')?.title).toBe('a-new');
		expect(byUrl.get('https://rondacontrol.es/b')?.title).toBe('b');
	});

	it('returns the single latest audit for a specific URL when url is supplied', async () => {
		await audits.saveAll([
			buildAudit({
				projectId: project.id,
				url: 'https://rondacontrol.es/a',
				observedAt: new Date('2026-05-08T06:00:00Z'),
				title: 'a-old',
			}),
			buildAudit({
				projectId: project.id,
				url: 'https://rondacontrol.es/a',
				observedAt: new Date('2026-05-09T06:00:00Z'),
				title: 'a-new',
			}),
			buildAudit({
				projectId: project.id,
				url: 'https://rondacontrol.es/b',
				observedAt: new Date('2026-05-09T05:00:00Z'),
				title: 'b',
			}),
		]);
		const result = await useCase.execute({
			projectId: project.id,
			competitorDomain: 'rondacontrol.es',
			url: 'https://rondacontrol.es/a',
		});
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0]?.title).toBe('a-new');
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({
				projectId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
				competitorDomain: 'rondacontrol.es',
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
