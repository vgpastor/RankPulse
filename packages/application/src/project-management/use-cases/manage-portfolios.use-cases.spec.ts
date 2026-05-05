import type { IdentityAccess, ProjectManagement } from '@rankpulse/domain';
import { ConflictError, FakeClock, FixedIdGenerator, NotFoundError, type Uuid } from '@rankpulse/shared';
import { InMemoryPortfolioRepository, RecordingEventPublisher } from '@rankpulse/testing';
import { describe, expect, it } from 'vitest';
import {
	CreatePortfolioUseCase,
	DeletePortfolioUseCase,
	GetPortfolioUseCase,
	ListPortfoliosUseCase,
	RenamePortfolioUseCase,
} from './manage-portfolios.use-cases.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111' as IdentityAccess.OrganizationId;

const buildCreate = () => {
	const repo = new InMemoryPortfolioRepository();
	const events = new RecordingEventPublisher();
	const useCase = new CreatePortfolioUseCase(
		repo,
		new FakeClock('2026-05-04T10:00:00Z'),
		new FixedIdGenerator(['portfolio-1' as Uuid]),
		events,
	);
	return { useCase, repo, events };
};

describe('CreatePortfolioUseCase', () => {
	it('creates and persists a portfolio with the given name', async () => {
		const { useCase, repo } = buildCreate();
		const result = await useCase.execute({ organizationId: ORG_ID, name: 'PatrolTech' });
		expect(result.portfolioId).toBe('portfolio-1');
		const stored = await repo.findById('portfolio-1' as ProjectManagement.PortfolioId);
		expect(stored?.name).toBe('PatrolTech');
	});

	it('rejects names shorter than 2 characters', async () => {
		const { useCase } = buildCreate();
		await expect(useCase.execute({ organizationId: ORG_ID, name: 'X' })).rejects.toThrow(/at least 2/);
	});
});

describe('ListPortfoliosUseCase', () => {
	it('returns all portfolios of the org with project counts', async () => {
		const repo = new InMemoryPortfolioRepository();
		const create = new CreatePortfolioUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['p-1' as Uuid, 'p-2' as Uuid]),
			new RecordingEventPublisher(),
		);
		await create.execute({ organizationId: ORG_ID, name: 'PatrolTech' });
		await create.execute({ organizationId: ORG_ID, name: 'RocStatus' });
		repo.setProjectCount('p-1' as ProjectManagement.PortfolioId, 3);

		const result = await new ListPortfoliosUseCase(repo).execute(ORG_ID);

		expect(result).toHaveLength(2);
		const patrol = result.find((p) => p.id === 'p-1');
		expect(patrol?.projectCount).toBe(3);
		const roc = result.find((p) => p.id === 'p-2');
		expect(roc?.projectCount).toBe(0);
	});
});

describe('GetPortfolioUseCase', () => {
	it('returns the formatted view including projectCount', async () => {
		const { repo } = await (async () => {
			const r = new InMemoryPortfolioRepository();
			const u = new CreatePortfolioUseCase(
				r,
				new FakeClock('2026-05-04T10:00:00Z'),
				new FixedIdGenerator(['p-1' as Uuid]),
				new RecordingEventPublisher(),
			);
			await u.execute({ organizationId: ORG_ID, name: 'PatrolTech' });
			r.setProjectCount('p-1' as ProjectManagement.PortfolioId, 5);
			return { repo: r };
		})();
		const view = await new GetPortfolioUseCase(repo).execute('p-1');
		expect(view).toMatchObject({ id: 'p-1', name: 'PatrolTech', projectCount: 5 });
	});

	it('throws NotFoundError when missing', async () => {
		await expect(
			new GetPortfolioUseCase(new InMemoryPortfolioRepository()).execute('missing'),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('RenamePortfolioUseCase', () => {
	it('renames an existing portfolio', async () => {
		const repo = new InMemoryPortfolioRepository();
		await new CreatePortfolioUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['p-1' as Uuid]),
			new RecordingEventPublisher(),
		).execute({ organizationId: ORG_ID, name: 'Old name' });

		const view = await new RenamePortfolioUseCase(repo).execute({ portfolioId: 'p-1', name: 'New name' });
		expect(view.name).toBe('New name');
	});

	it('throws when the portfolio does not exist', async () => {
		await expect(
			new RenamePortfolioUseCase(new InMemoryPortfolioRepository()).execute({
				portfolioId: 'missing',
				name: 'X',
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('DeletePortfolioUseCase', () => {
	it('deletes when no projects reference the portfolio', async () => {
		const repo = new InMemoryPortfolioRepository();
		await new CreatePortfolioUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['p-1' as Uuid]),
			new RecordingEventPublisher(),
		).execute({ organizationId: ORG_ID, name: 'PatrolTech' });

		await new DeletePortfolioUseCase(repo).execute('p-1');

		expect(await repo.findById('p-1' as ProjectManagement.PortfolioId)).toBeNull();
	});

	it('refuses to delete when projects still reference the portfolio (BACKLOG #11)', async () => {
		const repo = new InMemoryPortfolioRepository();
		await new CreatePortfolioUseCase(
			repo,
			new FakeClock('2026-05-04T10:00:00Z'),
			new FixedIdGenerator(['p-1' as Uuid]),
			new RecordingEventPublisher(),
		).execute({ organizationId: ORG_ID, name: 'PatrolTech' });
		repo.setProjectCount('p-1' as ProjectManagement.PortfolioId, 7);

		await expect(new DeletePortfolioUseCase(repo).execute('p-1')).rejects.toBeInstanceOf(ConflictError);
		expect(await repo.findById('p-1' as ProjectManagement.PortfolioId)).not.toBeNull();
	});

	it('throws NotFoundError when the portfolio does not exist', async () => {
		await expect(
			new DeletePortfolioUseCase(new InMemoryPortfolioRepository()).execute('missing'),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
