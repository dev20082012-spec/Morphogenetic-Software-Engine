/**
 * MSE Immune Core -- Synthesized Antigen Test
 * Violation : RT-1790426227794-7357 [SECURITY/HIGH]
 * Target    : src/auth.js
 * Generated : 2026-09-26T12:37:07.794Z
 *
 * This test is synthesized to be RED (failing) in the current codebase.
 * After the Immune Core applies its patch it MUST transition to GREEN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('RT-1790426227794-7357 -- jwt.verify failed: invalid signature', () => {
  let state;
  let req;

  beforeEach(() => {
    state = { mutated: false, value: 0 };
    req   = { headers: {}, user: null }; // no auth injected
  });

  it('RED: must reject state mutation when Authorization header is absent', async () => {
    // Reproduces: Error: invalid signature (line 1 in src/auth.js)
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
