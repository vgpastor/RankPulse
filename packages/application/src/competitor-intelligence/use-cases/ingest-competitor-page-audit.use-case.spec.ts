import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { FixedIdGenerator, type Uuid } from '@rankpulse/shared';
import {
	aProject,
	InMemoryCompetitorPageAuditRepository,
	InMemoryProjectRepository,
} from '@rankpulse/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestCompetitorPageAuditUseCase } from './ingest-competitor-page-audit.use-case.js';

const orgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc' as Uuid as IdentityAccess.OrganizationId;

const auditFields = (): Parameters<IngestCompetitorPageAuditUseCase['execute']>[0]['audit'] => ({
	statusCode: 200,
	statusMessage: 'OK',
	fetchTimeMs: 432,
	pageSizeBytes: 89_000,
	title: 'Competitor landing',
	metaDescription: 'Best app',
	h1: 'Welcome',
	h2Count: 4,
	h3Count: 7,
	wordCount: 1250,
	plainTextSizeBytes: 8_500,
	internalLinksCount: 33,
	externalLinksCount: 5,
	hasSchemaOrg: true,
	schemaTypes: ['Organization', 'WebSite'],
	canonicalUrl: 'https://rondacontrol.es/landing',
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
	observedAtProvider: new Date('2026-05-09T05:55:00Z'),
});

describe('IngestCompetitorPageAuditUseCase', () => {
	let projects: InMemoryProjectRepository;
	let audits: InMemoryCompetitorPageAuditRepository;
	let project: ProjectManagement.Project;
	let useCase: IngestCompetitorPageAuditUseCase;

	const ids = (n: number): FixedIdGenerator =>
		new FixedIdGenerator(
			Array.from({ length: n }, (_, i) => `dddddddd-dddd-dddd-dddd-${String(i).padStart(12, '0')}` as Uuid),
		);

	beforeEach(async () => {
		projects = new InMemoryProjectRepository();
		audits = new InMemoryCompetitorPageAuditRepository();
		project = aProject({ organizationId: orgId });
		await projects.save(project);
		useCase = new IngestCompetitorPageAuditUseCase(projects, audits, ids(10));
	});

	it('persists exactly one fat audit row stamped with sourceProvider=dataforseo', async () => {
		const result = await useCase.execute({
			projectId: project.id,
			competitorDomain: 'rondacontrol.es',
			url: 'https://rondacontrol.es/landing',
			rawPayloadId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			observedAt: new Date('2026-05-09T06:00:00Z'),
			audit: auditFields(),
		});
		expect(result.ingested).toBe(1);
		expect(audits.rows).toHaveLength(1);
		const row = audits.rows[0];
		expect(row?.competitorDomain).toBe('rondacontrol.es');
		expect(row?.url).toBe('https://rondacontrol.es/landing');
		expect(row?.sourceProvider).toBe('dataforseo');
		expect(row?.statusCode).toBe(200);
		expect(row?.lcpMs).toBe(2_100);
		expect(row?.schemaTypes).toEqual(['Organization', 'WebSite']);
		expect(row?.observedAtProvider).toEqual(new Date('2026-05-09T05:55:00Z'));
	});

	it('throws NotFoundError when the project does not exist', async () => {
		await expect(
			useCase.execute({
				projectId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
				competitorDomain: 'rondacontrol.es',
				url: 'https://rondacontrol.es/landing',
				rawPayloadId: null,
				audit: auditFields(),
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
