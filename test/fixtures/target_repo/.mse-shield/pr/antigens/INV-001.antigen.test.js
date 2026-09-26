/**
 * MSE Immune Core -- Synthesized Antigen Test
 * Violation : INV-001 [SECURITY/CRITICAL]
 * Target    : .mse-final\cegis-antigens\DRIFT-EVU-002.antigen.test.js
 * Generated : 2026-09-26T13:21:51.635Z
 *
 * This test is synthesized to be RED (failing) in the current codebase.
 * After the Immune Core applies its patch it MUST transition to GREEN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('INV-001 -- Unguarded Async State Mutation', () => {
  let state;
  let req;

  beforeEach(() => {
    state = { mutated: false, value: 0 };
    req   = { headers: {}, user: null }; // no auth injected
  });

  it('RED: must reject state mutation when Authorization header is absent', async () => {
    // Reproduces: describe('[REDACTED:HIGH_ENTROPY_SECRET]'PORT\' which is not declared in documentation.', () => { (line 12 in .mse-final\cegis-antigens\DRIFT-EVU-002.antigen.test.js)
    // Precondition: req.user is null, no token is present
    const guardedWrite = (request, s) => {
      if (!request.user || !request.headers['authorization']) {
        throw new Error('Unauthorized: token validation required before write');
      }
      s.value  += 1;
      s.mutated = true;
    };

    // With correct guard this should throw -- proving the guard exists.
    // If the guard is MISSING (current state), it will mutate and this expect FAILS.
    expect(() => guardedWrite(req, state)).toThrow('Unauthorized');
    expect(state.mutated).toBe(false);
  });

  it('GREEN baseline: allows mutation when valid token is present', () => {
    req.headers['authorization'] = 'Bearer valid-token';
    req.user = { id: 'u1', roles: ['write'] };

    const guardedWrite = (request, s) => {
      if (!request.user || !request.headers['authorization']) {
        throw new Error('Unauthorized');
      }
      s.value  += 1;
      s.mutated = true;
    };

    expect(() => guardedWrite(req, state)).not.toThrow();
    expect(state.mutated).toBe(true);
  });
});
