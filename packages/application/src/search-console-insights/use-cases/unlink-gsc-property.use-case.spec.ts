import { IdentityAccess, ProjectManagement, SearchConsoleInsights } from '@rankpulse/domain';
import { FakeClock, NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryGscPropertyRepository } from '@rankpulse/testing';
import { ConflictError } from '@rankpulse/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { UnlinkGscPropertyUseCase } from './unlink-gsc-property.use-case.js';

const PROP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as Uuid as SearchConsoleInsights.GscPropertyId;
const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as Uuid as ProjectManagement.ProjectId;
const ORG_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as Uuid as IdentityAccess.OrganizationId;

describe('UnlinkGscPropertyUseCase', () => {
	let properties: InMemoryGscPropertyRepository;
	let clock: FakeClock;
	let useCase: UnlinkGscPropertyUseCase;

	beforeEach(async () => {
		properties = new InMemoryGscPropertyRepository();
		clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
		useCase = new UnlinkGscPropertyUseCase(properties, clock);
		const property = SearchConsoleInsights.GscProperty.link({
			id: PROP_ID,
			organizationId: ORG_ID,
			projectId: PROJECT_ID,
			siteUrl: 'sc-domain:example.com',
			propertyType: 'DOMAIN' as SearchConsoleInsights.GscPropertyType,
			credentialId: null,
			now: clock.now(),
		});
		await properties.save(property);
	});

	it('stamps unlinked_at on success', async () => {
		const res = await useCase.execute({ gscPropertyId: PROP_ID });
		expect(res.unlinked).toBe(true);
		const after = await properties.findById(PROP_ID);
		expect(after?.unlinkedAt).toEqual(clock.now());
		expect(after?.isActive()).toBe(false);
	});

	it('throws NotFoundError when id is unknown', async () => {
		await expect(
			useCase.execute({ gscPropertyId: '00000000-0000-0000-0000-000000000000' }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('throws ConflictError when already unlinked', async () => {
		await useCase.execute({ gscPropertyId: PROP_ID });
		await expect(useCase.execute({ gscPropertyId: PROP_ID })).rejects.toBeInstanceOf(ConflictError);
	});
});
