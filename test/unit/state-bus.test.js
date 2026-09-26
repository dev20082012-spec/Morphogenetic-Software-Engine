/**
 * Unit Tests: StateBus
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StateBus } from '../../src/core/state-bus.js';

describe('StateBus', () => {
  let bus;

  beforeEach(() => {
    bus = new StateBus();
  });

  it('delivers emitted events to a subscriber', () => {
    const received = [];
    bus.subscribe(e => received.push(e));
    bus.emit({ phase: 'TEST', status: 'running' });
    expect(received).toHaveLength(1);
    expect(received[0].phase).toBe('TEST');
    expect(received[0].status).toBe('running');
  });

  it('stamps events with a timestamp', () => {
    const received = [];
    bus.subscribe(e => received.push(e));
    bus.emit({ phase: 'ALPHA', status: 'done' });
    expect(received[0].timestamp).toBeDefined();
    expect(new Date(received[0].timestamp).toISOString()).toBe(received[0].timestamp);
  });

  it('does not deliver events to unsubscribed handlers', () => {
    const received = [];
    const unsub = bus.subscribe(e => received.push(e));
    unsub();
    bus.emit({ phase: 'TEST', status: 'running' });
    expect(received).toHaveLength(0);
  });

  it('accumulates history across multiple emits', () => {
    bus.emit({ phase: 'A', status: 'running' });
    bus.emit({ phase: 'A', status: 'done' });
    bus.emit({ phase: 'B', status: 'running' });
    expect(bus.history()).toHaveLength(3);
  });

  it('resets history on reset()', () => {
    bus.emit({ phase: 'A', status: 'running' });
    bus.reset();
    expect(bus.history()).toHaveLength(0);
  });

  it('isolates a broken subscriber from crashing the bus', () => {
    bus.subscribe(() => { throw new Error('broken subscriber'); });
    const received = [];
    bus.subscribe(e => received.push(e));
    expect(() => bus.emit({ phase: 'X', status: 'running' })).not.toThrow();
    expect(received).toHaveLength(1);
  });
});
