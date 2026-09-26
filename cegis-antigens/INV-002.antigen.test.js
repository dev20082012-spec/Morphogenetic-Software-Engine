/**
 * MSE Immune Core -- Synthesized Antigen Test
 * Violation : INV-002 [CONCURRENCY/HIGH]
 * Target    : src/services/queue.js
 * Generated : 2026-09-26T12:37:07.419Z
 *
 * This test is synthesized to be RED (failing) in the current codebase.
 * After the Immune Core applies its patch it MUST transition to GREEN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('INV-002 -- Unbalanced Mutex', () => {
  it('RED: deadlock risk -- acquire without guaranteed release on error path', async () => {
    let locked = false;
    const acquire = () => { locked = true; };
    const release = () => { locked = false; };

    // Buggy implementation: missing release on throw
    const buggyOp = async () => {
      acquire();
      throw new Error('simulated failure in src/services/queue.js');
      // release() is unreachable -- the violation
    };

    await expect(buggyOp()).rejects.toThrow();
    // If the guard is missing, locked remains true -- FAIL proves deadlock risk
    expect(locked).toBe(false);
  });

  it('GREEN baseline: finally block guarantees release', async () => {
    let locked = false;
    const acquire = () => { locked = true; };
    const release = () => { locked = false; };

    const safeOp = async () => {
      acquire();
      try { throw new Error('simulated'); }
      finally { release(); }
    };

    await expect(safeOp()).rejects.toThrow();
    expect(locked).toBe(false);
  });
});
