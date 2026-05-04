import type { SharedKernel } from '@rankpulse/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryEventPublisher } from './in-memory-event-publisher.js';

const event = (type: string, payload: Record<string, unknown> = {}): SharedKernel.DomainEvent =>
	({ type, occurredAt: new Date('2026-01-01T00:00:00Z'), ...payload }) as SharedKernel.DomainEvent;

describe('InMemoryEventPublisher', () => {
	it('routes events to listeners registered for their specific type', async () => {
		const bus = new InMemoryEventPublisher();
		const received: SharedKernel.DomainEvent[] = [];
		bus.on('OrganizationCreated', (e) => {
			received.push(e);
		});
		await bus.publish([event('OrganizationCreated'), event('SomeOtherEvent')]);
		expect(received).toHaveLength(1);
		expect(received[0]?.type).toBe('OrganizationCreated');
	});

	it('also delivers each event to wildcard listeners', async () => {
		const bus = new InMemoryEventPublisher();
		const all: SharedKernel.DomainEvent[] = [];
		bus.onAny((e) => {
			all.push(e);
		});
		await bus.publish([event('A'), event('B')]);
		expect(all.map((e) => e.type)).toEqual(['A', 'B']);
	});

	it('returns an unsubscribe function from on()', async () => {
		const bus = new InMemoryEventPublisher();
		const received: SharedKernel.DomainEvent[] = [];
		const off = bus.on('X', (e) => {
			received.push(e);
		});
		await bus.publish([event('X')]);
		off();
		await bus.publish([event('X')]);
		expect(received).toHaveLength(1);
	});
});
