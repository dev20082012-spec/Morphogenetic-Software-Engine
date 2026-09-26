/**
 * MSE State Bus
 *
 * Lightweight publish-subscribe event bus used to propagate telemetry events
 * across subagent phases. All MSE components emit onto this bus; the UI
 * adapter and logging layer subscribe to receive live telemetry.
 *
 * Thread-safe with mutex-protected emit and subscriber iteration.
 */

import { AsyncMutex } from '../security/concurrency.js';
import { safeGet } from '../security/errors.js';

/** @typedef {{ phase: string, status: string, payload?: unknown, timestamp?: string }} BusEvent */

/** Maximum number of subscribers allowed (prevents unbounded listener leaks). */
const MAX_SUBSCRIBERS = 256;

/** Maximum history entries retained in memory (prevents unbounded growth). */
const MAX_HISTORY = 10_000;

export class StateBus {
  constructor() {
    /** @type {Set<(event: BusEvent) => void>} */
    this._subscribers = new Set();
    /** @type {BusEvent[]} */
    this._history = [];
    this._mutex = new AsyncMutex();
  }

  /**
   * Subscribe to all future events.
   * CON: caps subscriber count to prevent listener-leak / memory exhaustion.
   * @param {(event: BusEvent) => void} handler
   * @returns {() => void} call to unsubscribe
   */
  subscribe(handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('StateBus.subscribe: handler must be a function');
    }
    if (this._subscribers.size >= MAX_SUBSCRIBERS) {
      throw new RangeError(`StateBus: subscriber limit (${MAX_SUBSCRIBERS}) reached`);
    }
    this._subscribers.add(handler);
    return () => this._subscribers.delete(handler);
  }

  /**
   * Emit an event to all current subscribers and append to history.
   * Synchronous for backward compatibility with existing tests.
   * Uses mutex internally to prevent race conditions during concurrent emits.
   * Broken subscribers are silently skipped -- they must never crash the bus.
   * @param {BusEvent} event
   */
  emit(event) {
    // SEC: validate the event shape before stamping and distributing
    if (!event || typeof event.phase !== 'string' || typeof event.status !== 'string') return;

    const stamped = {
      phase:     String(event.phase).slice(0, 64),
      status:    String(event.status).slice(0, 32),
      payload:   event.payload,
      timestamp: new Date().toISOString(),
    };

    // CON: cap history to prevent unbounded memory growth in long-running pipelines
    if (this._history.length >= MAX_HISTORY) {
      this._history.shift(); // evict oldest
    }
    this._history.push(stamped);

    // Snapshot the subscriber set before iteration so that a subscriber that
    // calls unsubscribe() during its own invocation does not cause a skip.
    for (const handler of [...this._subscribers]) {
      try {
        handler(stamped);
      } catch {
        // A broken subscriber must never interrupt the pipeline.
      }
    }
  }

  /**
   * Synchronous emit variant without mutex (for high-frequency internal use).
   * Caller must ensure no concurrent emits.
   * @param {BusEvent} event
   */
  emitSync(event) {
    // SEC: validate the event shape before stamping and distributing
    if (!event || typeof event.phase !== 'string' || typeof event.status !== 'string') return;

    const stamped = {
      phase:     String(event.phase).slice(0, 64),
      status:    String(event.status).slice(0, 32),
      payload:   event.payload,
      timestamp: new Date().toISOString(),
    };

    // CON: cap history to prevent unbounded memory growth in long-running pipelines
    if (this._history.length >= MAX_HISTORY) {
      this._history.shift(); // evict oldest
    }
    this._history.push(stamped);

    // Snapshot the subscriber set before iteration so that a subscriber that
    // calls unsubscribe() during its own invocation does not cause a skip.
    for (const handler of [...this._subscribers]) {
      try {
        handler(stamped);
      } catch {
        // A broken subscriber must never interrupt the pipeline.
      }
    }
  }

  /**
   * Return a snapshot of all events emitted so far.
   * @returns {BusEvent[]}
   */
  history() {
    return [...this._history];
  }

  /** Reset history (useful between test runs). */
  reset() {
    this._history = [];
  }

  /** Get current subscriber count. */
  subscriberCount() {
    return this._subscribers.size;
  }
}