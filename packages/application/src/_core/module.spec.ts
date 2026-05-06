import { describe, expect, it } from 'vitest';
import type {
	ContextModule,
	ContextRegistrations,
	EventHandler,
	IngestUseCase,
	SharedDeps,
} from './module.js';

describe('ContextModule types', () => {
	it('compiles a minimal module', () => {
		const ingest: IngestUseCase = {
			execute: async () => {},
		};
		const handler: EventHandler = {
			events: ['SampleEvent'],
			handle: async () => {},
		};
		const module: ContextModule = {
			id: 'sample',
			compose: (_deps: SharedDeps): ContextRegistrations => ({
				useCases: { foo: {} },
				ingestUseCases: { 'sample:ingest': ingest },
				eventHandlers: [handler],
				schemaTables: [],
			}),
		};
		expect(module.id).toBe('sample');
	});

	it('compose returns an object with the required shape', () => {
		const fakeDeps = {} as SharedDeps;
		const module: ContextModule = {
			id: 'x',
			compose: () => ({
				useCases: {},
				ingestUseCases: {},
				eventHandlers: [],
				schemaTables: [],
			}),
		};
		const regs = module.compose(fakeDeps);
		expect(regs.useCases).toBeDefined();
		expect(regs.ingestUseCases).toBeDefined();
		expect(Array.isArray(regs.eventHandlers)).toBe(true);
	});
});
