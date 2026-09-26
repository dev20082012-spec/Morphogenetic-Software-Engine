/**
 * Concurrency Control -- Race Condition Prevention
 *
 * Provides:
 * - Async mutex for critical sections
 * - Semaphore for resource pooling
 * - File write locking
 * - Event bus synchronization
 */

import { EventEmitter } from 'node:events';

/**
 * Async mutex implementation for protecting critical sections.
 */
export class AsyncMutex {
  constructor() {
    this._locked = false;
    this._waiters = [];
  }

  /**
   * Acquire the lock, waiting if necessary.
   * @returns {Promise<() => void>} Release function
   */
  async acquire() {
    if (!this._locked) {
      this._locked = true;
      return this._release.bind(this);
    }

    return new Promise((resolve) => {
      this._waiters.push(() => {
        this._locked = true;
        resolve(this._release.bind(this));
      });
    });
  }

  _release() {
    if (this._waiters.length > 0) {
      const next = this._waiters.shift();
      next();
    } else {
      this._locked = false;
    }
  }

  /**
   * Execute a function with the lock held.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async runExclusive(fn) {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** @returns {boolean} */
  isLocked() { return this._locked; }
}

/**
 * Async semaphore for limiting concurrent operations.
 */
export class AsyncSemaphore {
  constructor(permits) {
    this._permits = permits;
    this._waiters = [];
  }

  /**
   * Acquire a permit.
   * @returns {Promise<() => void>} Release function
   */
  async acquire() {
    if (this._permits > 0) {
      this._permits--;
      return this._release.bind(this);
    }

    return new Promise((resolve) => {
      this._waiters.push(() => {
        this._permits--;
        resolve(this._release.bind(this));
      });
    });
  }

  _release() {
    this._permits++;
    if (this._waiters.length > 0) {
      const next = this._waiters.shift();
      next();
    }
  }

  /**
   * Execute a function with a permit.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async runWithPermit(fn) {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** @returns {number} */
  availablePermits() { return this._permits; }
}

/**
 * File write lock to prevent concurrent writes to the same file.
 * Uses a per-path mutex map.
 */
export class FileWriteLock {
  constructor() {
    this._locks = new Map();
  }

  _getLock(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    if (!this._locks.has(normalized)) {
      this._locks.set(normalized, new AsyncMutex());
    }
    return this._locks.get(normalized);
  }

  /**
   * Execute a write operation with exclusive access to the file.
   * @template T
   * @param {string} filePath
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async writeExclusive(filePath, fn) {
    const lock = this._getLock(filePath);
    return lock.runExclusive(fn);
  }

  /**
   * Clean up unused locks (call periodically).
   */
  cleanup() {
    for (const [path, lock] of this._locks) {
      if (!lock.isLocked()) {
        this._locks.delete(path);
      }
    }
  }
}

/**
 * Global file write lock instance.
 */
export const fileWriteLock = new FileWriteLock();

/**
 * Synchronized Event Bus - wraps StateBus with mutex for thread-safe emits.
 */
export class SynchronizedEventBus extends EventEmitter {
  constructor() {
    super();
    this._mutex = new AsyncMutex();
    this._history = [];
    this._maxHistory = 10000;
  }

  /**
   * Emit an event with mutex protection.
   * @param {string} eventName
   * @param {...unknown} args
   */
  async emitSync(eventName, ...args) {
    return this._mutex.runExclusive(() => {
      // Trim history if needed
      if (this._history.length >= this._maxHistory) {
        this._history.shift();
      }
      this._history.push({ event: eventName, args, timestamp: Date.now() });
      super.emit(eventName, ...args);
    });
  }

  /**
   * Get event history.
   * @returns {Array<{event: string, args: unknown[], timestamp: number}>}
   */
  getHistory() {
    return [...this._history];
  }

  /**
   * Clear history.
   */
  clearHistory() {
    this._history = [];
  }
}

/**
 * Batch processor for handling multiple items with controlled concurrency.
 *
 * @template T, R
 * @param {T[]} items
 * @param {(item: T) => Promise<R>} processor
 * @param {object} options
 * @param {number} [options.concurrency=4] - Max concurrent operations
 * @param {boolean} [options.stopOnError=false] - Stop on first error
 * @returns {Promise<{ results: R[], errors: Error[] }>}
 */
export async function processBatch(items, processor, options = {}) {
  const { concurrency = 4, stopOnError = false } = options;
  const semaphore = new AsyncSemaphore(concurrency);
  const results = [];
  const errors = [];

  await Promise.all(items.map(async (item, index) => {
    const release = await semaphore.acquire();
    try {
      const result = await processor(item);
      results[index] = result;
    } catch (err) {
      errors.push(err);
      if (stopOnError) {
        // Cancel remaining by acquiring all permits
        while (semaphore.availablePermits() < concurrency) {
          await new Promise(r => setTimeout(r, 10));
        }
      }
    } finally {
      release();
    }
  }));

  return { results, errors };
}

/**
 * Retry a function with exponential backoff.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object} options
 * @param {number} [options.maxAttempts=3]
 * @param {number} [options.baseDelayMs=100]
 * @param {number} [options.maxDelayMs=5000]
 * @param {(error: Error) => boolean} [options.retryable] - Predicate to determine if error is retryable
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 100,
    maxDelayMs = 5000,
    retryable = () => true,
  } = options;

  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!retryable(err) || attempt === maxAttempts - 1) {
        throw err;
      }
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export default {
  AsyncMutex,
  AsyncSemaphore,
  FileWriteLock,
  fileWriteLock,
  SynchronizedEventBus,
  processBatch,
  withRetry,
};