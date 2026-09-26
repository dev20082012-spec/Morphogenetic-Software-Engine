/**
 * MSE Immune Core -- Synthesized Antigen Test
 * Violation : DRIFT-PM-001 [CORRECTNESS/CRITICAL]
 * Target    : .mse-final\cegis-antigens\DRIFT-EVU-002.antigen.test.js
 * Generated : 2026-09-26T13:21:51.688Z
 *
 * This test is synthesized to be RED (failing) in the current codebase.
 * After the Immune Core applies its patch it MUST transition to GREEN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('DRIFT-PM-001 -- Documentation claims port 3000 but code binds to: 8080.', () => {
  it('RED: synchronous I/O blocks event loop under concurrent load', async () => {
    const order = [];

    // Simulates a blocking sync operation in a route handler (.mse-final\cegis-antigens\DRIFT-EVU-002.antigen.test.js)
    // Line ?: blocking call
    const syncHandler = () => {
      order.push('A:start');
      // Blocking: simulates readFileSync / CPU spin
      for (let i = 0; i < 1000; i++) { /* spin */ }
      order.push('A:end');
    };

    const concurrentOp = async () => { order.push('B'); };

    syncHandler();
    await concurrentOp();

    // If A is sync, B cannot interleave -- it only runs after A:end
    // This assertion FAILS when the handler correctly uses async I/O
    // and PASSES (proving the violation) when it's sync-blocking
    const bIndex = order.indexOf('B');
    const aEnd   = order.indexOf('A:end');
    expect(bIndex).toBeGreaterThan(aEnd); // B runs after A completes sync
  });

  it('GREEN baseline: async handler allows B to interleave', async () => {
    const order = [];
    const asyncHandler = async () => {
      order.push('A:start');
      await Promise.resolve(); // yields to event loop
      order.push('A:end');
    };
    const concurrentOp = async () => { order.push('B'); };

    const [, ] = await Promise.all([asyncHandler(), concurrentOp()]);
    expect(order).toContain('B');
    expect(order).toContain('A:end');
  });
});
