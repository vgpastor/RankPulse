import type { DomainEvent } from './domain-event.js';

export abstract class AggregateRoot {
	private _events: DomainEvent[] = [];

	protected record(event: DomainEvent): void {
		this._events.push(event);
	}

	pullEvents(): readonly DomainEvent[] {
		const out = this._events;
		this._events = [];
		return out;
	}

	peekEvents(): readonly DomainEvent[] {
		return this._events;
	}
}
