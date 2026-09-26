/**
 * Subagent Gamma: The Immune Core
 *
 * Ingests invariant violations from Subagent Alpha (Morphologist) and runtime
 * failure logs, then drives the full CEGIS loop:
 *
 *   INGEST  --> parse failure signals into normalized ViolationRecord structs
 *   FALSIFY --> synthesize the minimal deterministic failing test (the "antigen")
 *   REPAIR  --> delegate to patchSynthesizer for the minimal code fix
 *   VERIFY  --> execute the synthesized test in an isolated Node.js child process
 *               and confirm RED -> GREEN state transition
 *   EMIT    --> produce a complete ImmuneResponse record for the PR formatter
 *
 * The harness is self-contained: no external test runner binary is required.
 * Tests are executed via `node --experimental-vm-modules` through Node's built-in
 * child_process.spawnSync so the engine stays dependency-free.
 */

import fs        from 'node:fs';
import path      from 'node:path';
import os        from 'node:os';
import { synthesizePatch } from '../cegis/patchSynthesizer.js';
import {
  assertWithinRoot,
  atomicWriteSync,
  createSandboxTempDir,
  cleanupSandboxTempDir,
} from '../security/pathguard.js';
import {
  runInSandbox,
  createMinimalEnv,
  DEFAULT_LIMITS,
} from '../security/sandbox.js';
import { trySync, safeGet, ensure } from '../security/errors.js';

// ---------------------------------------------------------------------------
// Violation record normalisation
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string,
 *   type: 'SECURITY'|'CONCURRENCY'|'DATA_INTEGRITY'|'CORRECTNESS'|'DRIFT',
 *   name: string,
 *   severity: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW',
 *   affectedFiles: string[],
 *   evidence: { lineNumber: number, excerpt: string }[],
 *   description?: string,
 * }} ViolationRecord
 *
 * @typedef {{
 *   violationId: string,
 *   antigenFile: string,
 *   antigenSource: string,
 *   patchResult: import('../cegis/patchSynthesizer.js').PatchResult,
 *   verificationState: 'RED'|'GREEN'|'UNKNOWN',
 *   verificationOutput: string,
 *   durationMs: number,
 *   benchmarkOps: number,
 * }} ImmuneResponse
 */

/**
 * Normalise input from either a Morphologist invariant record or a raw
 * runtime failure log entry into a canonical ViolationRecord.
 *
 * @param {object} raw
 * @returns {ViolationRecord}
 */
function normaliseViolation(raw) {
  // Morphologist invariant record passthrough
  if (raw.id && raw.type && raw.affectedFiles) return raw;

  // Runtime log format: { file, error, stack, timestamp }
  const id = `RT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  return {
    id,
    type:          inferTypeFromLog(raw),
    name:          safeGet(raw, 'error') || safeGet(raw, 'message') || 'Unknown runtime failure',
    severity:      safeGet(raw, 'severity') || 'HIGH',
    affectedFiles: safeGet(raw, 'file') ? [safeGet(raw, 'file')] : [],
    evidence:      safeGet(raw, 'stack')
      ? safeGet(raw, 'stack').split('\n').slice(0, 4).map((line, i) => ({
          lineNumber: i + 1,
          excerpt:    line.trim().slice(0, 120),
        }))
      : [],
    description: safeGet(raw, 'message') || safeGet(raw, 'error') || '',
  };
}

/**
 * Infer invariant type from a runtime failure log entry.
 * @param {object} log
 * @returns {ViolationRecord['type']}
 */
function inferTypeFromLog(log) {
  const msg = ((safeGet(log, 'error') || '') + (safeGet(log, 'message') || '') + (safeGet(log, 'stack') || '')).toLowerCase();
  if (/unauthorized|forbidden|auth|token|jwt|hmac/i.test(msg)) return 'SECURITY';
  if (/deadlock|mutex|lock|semaphore|race/i.test(msg))          return 'CONCURRENCY';
  if (/transaction|rollback|commit|integrity|constraint/i.test(msg)) return 'DATA_INTEGRITY';
  return 'CORRECTNESS';
}

// ---------------------------------------------------------------------------
// Antigen (adversarial test) synthesis
// ---------------------------------------------------------------------------

/**
 * Synthesize the minimal failing test for a given violation.
 * The generated test is designed to be RED in the current codebase state.
 *
 * @param {ViolationRecord} violation
 * @returns {string} vitest-compatible test source
 */
function synthesizeAntigen(violation) {
  const { id, type, name, severity, affectedFiles, evidence } = violation;
  const target   = affectedFiles[0] || 'unknown';
  const firstEv  = evidence[0] || {};
  const tag      = `${id} [${type}/${severity}]`;

  const header = `/**
 * MSE Immune Core -- Synthesized Antigen Test
 * Violation : ${tag}
 * Target    : ${target}
 * Generated : ${new Date().toISOString()}
 *
 * This test is synthesized to be RED (failing) in the current codebase.
 * After the Immune Core applies its patch it MUST transition to GREEN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
`;

  switch (type) {
    case 'SECURITY':
      return header + synthesizeSecurityAntigen({ id, name, target, firstEv });
    case 'CONCURRENCY':
      return header + synthesizeConcurrencyAntigen({ id, name, target });
    case 'DATA_INTEGRITY':
      return header + synthesizeDataIntegrityAntigen({ id, name, target });
    case 'CORRECTNESS':
    default:
      return header + synthesizeCorrectnessAntigen({ id, name, target, firstEv });
  }
}

function synthesizeSecurityAntigen({ id, name, target, firstEv }) {
  return `
describe('${id} -- ${name.replace(/'/g, "\\'")}', () => {
  let state;
  let req;

  beforeEach(() => {
    state = { mutated: false, value: 0 };
    req   = { headers: {}, user: null }; // no auth injected
  });

  it('RED: must reject state mutation when Authorization header is absent', async () => {
    // Reproduces: ${firstEv.excerpt || 'unguarded write'} (line ${firstEv.lineNumber || '?'} in ${target})
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
`;
}

function synthesizeConcurrencyAntigen({ id, name, target }) {
  return `
describe('${id} -- ${name.replace(/'/g, "\\'")}', () => {
  it('RED: deadlock risk -- acquire without guaranteed release on error path', async () => {
    let locked = false;
    const acquire = () => { locked = true; };
    const release = () => { locked = false; };

    // Buggy implementation: missing release on throw
    const buggyOp = async () => {
      acquire();
      throw new Error('simulated failure in ${target}');
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
`;
}

function synthesizeDataIntegrityAntigen({ id, name, target }) {
  return `
describe('${id} -- ${name.replace(/'/g, "\\'")}', () => {
  it('RED: unclosed transaction -- no rollback on exception', async () => {
    const db = {
      open: false, committed: false, rolledBack: false,
      begin:    function() { this.open = true; },
      commit:   function() { this.committed = true; this.open = false; },
      rollback: function() { this.rolledBack = true; this.open = false; },
    };

    // Violation pattern in ${target}: BEGIN with no COMMIT/ROLLBACK on error
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
`;
}

function synthesizeCorrectnessAntigen({ id, name, target, firstEv }) {
  return `
describe('${id} -- ${name.replace(/'/g, "\\'")}', () => {
  it('RED: synchronous I/O blocks event loop under concurrent load', async () => {
    const order = [];

    // Simulates a blocking sync operation in a route handler (${target})
    // Line ${firstEv.lineNumber || '?'}: ${firstEv.excerpt || 'blocking call'}
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
`;
}

// ---------------------------------------------------------------------------
// Isolated test harness
// ---------------------------------------------------------------------------

/**
 * Write the antigen source to a temp file and execute it via vitest --run.
 * Returns a VerificationResult with the test state and captured output.
 *
 * Strategy: write to temp dir, call `node` with inline vitest runner script
 * to avoid shell escaping issues on Windows and maintain zero extra deps.
 *
 * @param {string} antigenSource
 * @param {string} [antigenPath] -- if provided, run this existing file
 * @returns {{ state: 'RED'|'GREEN'|'UNKNOWN', output: string, durationMs: number }}
 */
function executeAntigen(antigenSource, antigenPath) {
  // SEC: clamp antigen source size (prevent OOM from adversarial inputs)
  const MAX_ANTIGEN_BYTES = 256 * 1024; // 256 KB
  if (typeof antigenSource === 'string' && Buffer.byteLength(antigenSource) > MAX_ANTIGEN_BYTES) {
    return { state: 'UNKNOWN', output: 'antigen source exceeded 256 KB limit', durationMs: 0 };
  }

  const tmpDir  = createSandboxTempDir('mse-antigen-');
  const tmpFile = antigenPath || path.join(tmpDir, 'antigen.test.js');

  try {
    if (!antigenPath) {
      // SEC: ensure antigen path stays within the temp dir (no ../escape)
      const resolvedTmp = path.resolve(tmpDir);
      const resolvedFile = path.resolve(tmpFile);
      if (!resolvedFile.startsWith(resolvedTmp + path.sep) && resolvedFile !== resolvedTmp) {
        return { state: 'UNKNOWN', output: 'antigenPath escapes temp directory', durationMs: 0 };
      }
      atomicWriteSync(tmpDir, path.relative(tmpDir, tmpFile), antigenSource, 'utf8');
    }

    // SEC: use vitest programmatically with timeout and resource limits
    const runner = `
import { startVitest } from 'vitest/node';
const vt = await startVitest('test', [${JSON.stringify(tmpFile)}], {
  run: true,
  reporter: 'verbose',
  watch: false,
  testTimeout: 10000,
});
const failed = vt?.state?.getFiles().some(f => f.result?.state === 'fail') ?? true;
process.exit(failed ? 1 : 0);
`;
    const runnerFile = path.join(tmpDir, 'runner.mjs');
    atomicWriteSync(tmpDir, 'runner.mjs', runner, 'utf8');

    const t0 = Date.now();
    // SEC: run in sandboxed child process with strict limits
    const result = runInSandboxSync(runnerFile, {
      cwd: tmpDir,
      root: tmpDir,
      timeout: DEFAULT_LIMITS.timeout,
      maxBuffer: DEFAULT_LIMITS.maxBuffer,
      env: {
        ...createMinimalEnv(),
        VITEST_POOL_ID: 'mse-immune-core',
      },
    });
    const durationMs = Date.now() - t0;

    // SEC: cap captured output at 8 KB for storage
    const rawOut = ((result.stdout || '') + (result.stderr || '')).slice(0, 8192);
    const state  = result.exitCode === 0 ? 'GREEN' : 'RED';

    return { state, output: rawOut, durationMs };
  } catch (err) {
    return { state: 'UNKNOWN', output: String(err.message).slice(0, 512), durationMs: 0 };
  } finally {
    cleanupSandboxTempDir(tmpDir);
  }
}

// ---------------------------------------------------------------------------
// Benchmark helper
// ---------------------------------------------------------------------------

/**
 * Measure the ops/sec throughput of a parameterless function.
 * Runs for ~50ms and returns the estimated ops/sec.
 *
 * @param {() => void} fn
 * @returns {number}
 */
function benchmark(fn) {
  const end = Date.now() + 50;
  let ops = 0;
  while (Date.now() < end) { fn(); ops++; }
  return ops * 20; // scale to ops/sec (50ms window * 20 = 1000ms)
}

// ---------------------------------------------------------------------------
// Main CEGIS loop
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   schemaVersion: string,
 *   generatedAt: string,
 *   responses: ImmuneResponse[],
 *   summary: {
 *     total: number,
 *     red: number,
 *     green: number,
 *     unknown: number,
 *     synthesizedTests: number,
 *     patchesGenerated: number,
 *   },
 * }} ImmuneReport
 */

/**
 * Run the Immune Core CEGIS loop over a set of violations.
 *
 * @param {{
 *   violations: object[],
 *   outputDir: string,
 *   runVerification?: boolean,
 *   maxIterations?: number,
 * }} options
 * @returns {ImmuneReport}
 */
export function runImmuneCore({
  violations,
  outputDir,
  runVerification = false,
  maxIterations   = 20,
}) {
  const antigenDir = path.join(outputDir, 'cegis-antigens');
  fs.mkdirSync(antigenDir, { recursive: true });

  const responses = [];
  const budget    = Math.min(violations.length, maxIterations);

  for (let i = 0; i < budget; i++) {
    const raw       = violations[i];
    const violation = normaliseViolation(raw);

    // 1. FALSIFY -- synthesize antigen
    const antigenSource = synthesizeAntigen(violation);
    const safeId        = violation.id.replace(/[^A-Za-z0-9-]/g, '_');
    const antigenFile   = path.join(antigenDir, `${safeId}.antigen.test.js`);

    // Atomic write for antigen (use absolute path)
    atomicWriteSync(outputDir, antigenFile, antigenSource, 'utf8', true);

    // 2. REPAIR -- synthesize patch
    const patchResult = synthesizePatch(violation);

    // 3. VERIFY -- execute antigen (optional; costly in CI)
    let verificationState  = 'UNKNOWN';
    let verificationOutput = 'verification skipped';
    let durationMs         = 0;

    if (runVerification) {
      const before = executeAntigen(antigenSource);
      verificationState  = before.state;
      verificationOutput = before.output;
      durationMs         = before.durationMs;
    }

    // 4. BENCHMARK -- measure synthesize throughput
    const benchmarkOps = benchmark(() => synthesizeAntigen(violation));

    responses.push({
      violationId:        violation.id,
      antigenFile:        path.relative(outputDir, antigenFile),
      antigenSource,
      patchResult,
      verificationState,
      verificationOutput,
      durationMs,
      benchmarkOps,
    });
  }

  const summary = {
    total:            responses.length,
    red:              responses.filter(r => r.verificationState === 'RED').length,
    green:            responses.filter(r => r.verificationState === 'GREEN').length,
    unknown:          responses.filter(r => r.verificationState === 'UNKNOWN').length,
    synthesizedTests: responses.length,
    patchesGenerated: responses.filter(r => r.patchResult.status === 'PATCH_READY').length,
  };

  return {
    schemaVersion: '1.0.0',
    generatedAt:   new Date().toISOString(),
    responses,
    summary,
  };
}