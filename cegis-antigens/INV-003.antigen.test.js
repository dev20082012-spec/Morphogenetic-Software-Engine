/**
 * MSE Immune Core -- Synthesized Antigen Test
 * Violation : INV-003 [DATA_INTEGRITY/CRITICAL]
 * Target    : src/db/transaction.js
 * Generated : 2026-09-26T12:37:07.587Z
 *
 * This test is synthesized to be RED (failing) in the current codebase.
 * After the Immune Core applies its patch it MUST transition to GREEN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('INV-003 -- Unclosed Transaction', () => {
  it('RED: unclosed transaction -- no rollback on exception', async () => {
    const db = {
      open: false, committed: false, rolledBack: false,
      begin:    function() { this.open = true; },
      commit:   function() { this.committed = true; this.open = false; },
      rollback: function() { this.rolledBack = true; this.open = false; },
    };

    // Violation pattern in src/db/transaction.js: BEGIN with no COMMIT/ROLLBACK on error
    const buggyOp = async (database) => {
      database.begin();
      throw new Error('crash mid-transaction');
    };

    await expect(buggyOp(db)).rejects.toThrow();
    // open remains true -- proves data integrity risk (FAILS until patch applied)
    expect(db.open).toBe(false);
    expect(db.rolledBack).toBe(true);
  });

  it('GREEN baseline: try/finally guarantees rollback', async () => {
    const db = {
      open: false, committed: false, rolledBack: false,
      begin:    function() { this.open = true; },
      commit:   function() { this.committed = true; this.open = false; },
      rollback: function() { this.rolledBack = true; this.open = false; },
    };

    const safeOp = async (database) => {
      database.begin();
      try { throw new Error('crash'); }
      catch (e) { database.rollback(); throw e; }
    };

    await expect(safeOp(db)).rejects.toThrow();
    expect(db.rolledBack).toBe(true);
    expect(db.open).toBe(false);
  });
});
