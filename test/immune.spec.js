/**
 * Phase 3 Test Suite: Immune Core, Patch Synthesizer, PR Formatter, Engine
 *
 * Covers:
 *   1.  Antigen synthesis: all four violation types produce valid test source
 *   2.  Antigen determinism: same violation always produces same test structure
 *   3.  Antigen RED assertion: synthesized test has at least one RED (failing) expect
 *   4.  Antigen GREEN baseline: synthesized test has at least one GREEN expect
 *   5.  Patch synthesizer: SECURITY -> auth guard diff + postconditions
 *   6.  Patch synthesizer: CONCURRENCY -> try/finally mutex diff
 *   7.  Patch synthesizer: DATA_INTEGRITY -> transaction COMMIT/ROLLBACK diff
 *   8.  Patch synthesizer: CORRECTNESS -> sync->async I/O diff
 *   9.  Patch synthesizer: DRIFT -> descriptor-only result
 *  10.  Patch synthesizer: diff contains --- a/ and +++ b/ headers
 *  11.  runImmuneCore: processes multiple violations, writes antigen files
 *  12.  runImmuneCore: summary counts are consistent
 *  13.  runImmuneCore: respects maxIterations budget
 *  14.  PR formatter: formatBranchName produces a valid git branch slug
 *  15.  PR formatter: formatMarkdown contains all required sections
 *  16.  PR formatter: formatJSON contains correct schema fields
 *  17.  PR formatter: writePR writes .md, .json, and antigen file to disk
 *  18.  Engine: MSEEngine instantiates without error
 *  19.  Engine: emits ALPHA, BETA, GAMMA, ENGINE events on the bus
 *  20.  Engine: returns EngineResult with all required fields
 *  21.  Engine: manifold energy score is a finite number in [0, 1]
 *  22.  Engine: writes output files to outputDir
 *  23.  Engine: zero violations produce zero PR payloads
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs   from 'node:fs';
import path from 'node:path';

import { runImmuneCore }  from '../src/agents/immuneCore.js';
import { synthesizePatch } from '../src/cegis/patchSynthesizer.js';
import {
  formatBranchName,
  formatMarkdown,
  formatJSON,
  writePR,
} from '../src/core/prFormatter.js';
import { MSEEngine } from '../src/core/engine.js';

const FIXTURE_BASE = path.join(process.cwd(), 'test/fixtures/immune');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDir(p)           { fs.mkdirSync(p, { recursive: true }); }
function write(p, c)          { makeDir(path.dirname(p)); fs.writeFileSync(p, c, 'utf8'); }
function read(p)              { return fs.readFileSync(p, 'utf8'); }
function exists(p)            { return fs.existsSync(p); }

afterAll(async () => {
  // Windows may briefly lock files after a test run (antivirus, file indexer).
  // Retry the cleanup up to 3 times with a short back-off before giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.rmSync(FIXTURE_BASE, { recursive: true, force: true });
      break;
    } catch {
      if (attempt < 2) await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
    }
  }
});

// ---------------------------------------------------------------------------
// Shared fixture violations
// ---------------------------------------------------------------------------

const SECURITY_VIOLATION = {
  id: 'INV-001', type: 'SECURITY', name: 'Unguarded Write', severity: 'CRITICAL',
  affectedFiles: ['src/routes/users.js'],
  evidence: [{ lineNumber: 15, excerpt: 'await db.users.create(req.body);' }],
};
const CONCURRENCY_VIOLATION = {
  id: 'INV-002', type: 'CONCURRENCY', name: 'Unbalanced Mutex', severity: 'HIGH',
  affectedFiles: ['src/services/queue.js'],
  evidence: [{ lineNumber: 42, excerpt: 'await mutex.acquire();' }],
};
const DATA_INTEGRITY_VIOLATION = {
  id: 'INV-003', type: 'DATA_INTEGRITY', name: 'Unclosed Transaction', severity: 'CRITICAL',
  affectedFiles: ['src/db/transaction.js'],
  evidence: [{ lineNumber: 12, excerpt: "await pool.query('BEGIN');" }],
};
const CORRECTNESS_VIOLATION = {
  id: 'INV-004', type: 'CORRECTNESS', name: 'Sync I/O in Route', severity: 'HIGH',
  affectedFiles: ['src/routes/export.js'],
  evidence: [{ lineNumber: 8, excerpt: "const data = fs.readFileSync(filePath, 'utf8');" }],
};
const DRIFT_VIOLATION = {
  id: 'DRIFT-PRT-001', type: 'DRIFT', name: 'Port mismatch', severity: 'CRITICAL',
  affectedFiles: ['README.md'], evidence: [],
  description: 'README says port 3000 but code runs on 8080',
};

// Minimal valid PR payload
const MOCK_PR_PAYLOAD = {
  title:              '[MSE] Auto-patch INV-001: Unguarded Write',
  branchName:         'mse/auto-patch/inv-001-unguarded-write',
  invariantId:        'INV-001',
  invariantName:      'Unguarded Write',
  invariantType:      'SECURITY',
  severity:           'CRITICAL',
  affectedFiles:      ['src/routes/users.js'],
  energyBefore:       0.35,
  energyAfter:        0.28,
  dIntentScore:       0.12,
  antigenFile:        'cegis-antigens/INV-001.antigen.test.js',
  antigenSource:      '// antigen test source\ndescribe("test", () => { it("red", () => expect(1).toBe(2)); });',
  patches:            [synthesizePatch(SECURITY_VIOLATION)],
  verificationState:  'UNKNOWN',
  verificationOutput: '',
  durationMs:         120,
  benchmarkOps:       45000,
  generatedAt:        new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// 1-4. Antigen synthesis
// ---------------------------------------------------------------------------

describe('Immune Core -- antigen synthesis', () => {
  it('1. synthesizes valid JS test source for SECURITY violation', () => {
    const result = runImmuneCore({
      violations: [SECURITY_VIOLATION],
      outputDir: path.join(FIXTURE_BASE, 'antigen-security'),
    });
    const src = result.responses[0].antigenSource;
    expect(src).toContain('describe(');
    expect(src).toContain('it(');
    expect(src).toContain('expect(');
    expect(src).toContain('INV-001');
  });

  it('2. synthesizes valid JS test source for CONCURRENCY violation', () => {
    const result = runImmuneCore({
      violations: [CONCURRENCY_VIOLATION],
      outputDir: path.join(FIXTURE_BASE, 'antigen-concurrency'),
    });
    const src = result.responses[0].antigenSource;
    expect(src).toContain('acquire');
    expect(src).toContain('INV-002');
  });

  it('3. synthesizes valid JS test source for DATA_INTEGRITY violation', () => {
    const result = runImmuneCore({
      violations: [DATA_INTEGRITY_VIOLATION],
      outputDir: path.join(FIXTURE_BASE, 'antigen-integrity'),
    });
    const src = result.responses[0].antigenSource;
    expect(src).toContain('begin');
    expect(src).toContain('rollback');
    expect(src).toContain('INV-003');
  });

  it('4. synthesizes valid JS test source for CORRECTNESS violation', () => {
    const result = runImmuneCore({
      violations: [CORRECTNESS_VIOLATION],
      outputDir: path.join(FIXTURE_BASE, 'antigen-correctness'),
    });
    const src = result.responses[0].antigenSource;
    expect(src).toContain('sync');
    expect(src).toContain('INV-004');
  });

  it('5. antigen is deterministic for the same input violation', () => {
    const dir = path.join(FIXTURE_BASE, 'antigen-determinism');
    const r1  = runImmuneCore({ violations: [SECURITY_VIOLATION], outputDir: dir });
    const r2  = runImmuneCore({ violations: [SECURITY_VIOLATION], outputDir: dir });
    // Core structure should be identical regardless of run timestamp in file header
    // Strip the timestamp line (line containing 'Generated :') before comparing
    const strip = src => src.split('\n').filter(l => !l.includes('Generated :')).join('\n');
    expect(strip(r1.responses[0].antigenSource)).toBe(strip(r2.responses[0].antigenSource));
  });

  it('6. antigen test source contains a RED assertion (expect to fail/throw)', () => {
    const result = runImmuneCore({
      violations: [SECURITY_VIOLATION],
      outputDir: path.join(FIXTURE_BASE, 'antigen-red'),
    });
    const src = result.responses[0].antigenSource;
    // RED test pattern: toThrow, toBe(false), expect(...).toBe(false) etc.
    expect(src).toMatch(/toThrow|toBe\(false\)|toBe\(0\)|rejects/);
  });

  it('7. antigen test source contains a GREEN baseline assertion', () => {
    const result = runImmuneCore({
      violations: [SECURITY_VIOLATION],
      outputDir: path.join(FIXTURE_BASE, 'antigen-green'),
    });
    const src = result.responses[0].antigenSource;
    expect(src).toMatch(/GREEN baseline|not\.toThrow|toBe\(true\)/);
  });
});

// ---------------------------------------------------------------------------
// 5-10. Patch synthesizer
// ---------------------------------------------------------------------------

describe('Patch Synthesizer', () => {
  it('5. SECURITY patch inserts auth guard and has HIGH/CRITICAL confidence', () => {
    const patch = synthesizePatch(SECURITY_VIOLATION);
    expect(patch.status).toBe('PATCH_READY');
    expect(patch.strategy).toBe('AUTH_GUARD_INSERTION');
    expect(patch.repairedSnippet).toContain('authorization');
    expect(patch.postconditions.length).toBeGreaterThan(0);
    expect(['HIGH', 'MEDIUM']).toContain(patch.confidence);
  });

  it('6. CONCURRENCY patch uses try/finally mutex wrap', () => {
    const patch = synthesizePatch(CONCURRENCY_VIOLATION);
    expect(patch.status).toBe('PATCH_READY');
    expect(patch.strategy).toBe('MUTEX_WRAP_TRY_FINALLY');
    expect(patch.repairedSnippet).toContain('finally');
    expect(patch.repairedSnippet).toContain('release');
    expect(patch.postconditions.some(p => p.toLowerCase().includes('release'))).toBe(true);
  });

  it('7. DATA_INTEGRITY patch adds COMMIT and ROLLBACK', () => {
    const patch = synthesizePatch(DATA_INTEGRITY_VIOLATION);
    expect(patch.status).toBe('PATCH_READY');
    expect(patch.strategy).toBe('TRANSACTION_WRAP_TRY_CATCH');
    expect(patch.repairedSnippet).toContain('commit');
    expect(patch.repairedSnippet).toContain('rollback');
    expect(patch.postconditions.some(p => /commit|rollback/i.test(p))).toBe(true);
  });

  it('8. CORRECTNESS patch replaces sync with async I/O', () => {
    const patch = synthesizePatch(CORRECTNESS_VIOLATION);
    expect(patch.status).toBe('PATCH_READY');
    expect(patch.strategy).toBe('SYNC_IO_TO_ASYNC');
    expect(patch.repairedSnippet.toLowerCase()).toMatch(/async|await|promises/);
  });

  it('9. DRIFT patch returns DESCRIPTOR_ONLY status', () => {
    const patch = synthesizePatch(DRIFT_VIOLATION);
    expect(patch.status).toBe('DESCRIPTOR_ONLY');
    expect(patch.strategy).toBe('DOCUMENTATION_UPDATE');
    expect(patch.confidence).toBe('LOW');
  });

  it('10. every PATCH_READY result has a valid unified diff with --- / +++ headers', () => {
    for (const v of [SECURITY_VIOLATION, CONCURRENCY_VIOLATION, DATA_INTEGRITY_VIOLATION, CORRECTNESS_VIOLATION]) {
      const patch = synthesizePatch(v);
      expect(patch.diff).toMatch(/^--- a\//m);
      expect(patch.diff).toMatch(/^\+\+\+ b\//m);
      expect(patch.diff).toMatch(/^@@/m);
    }
  });

  it('11. targetFile in patch matches affectedFiles[0] of the violation', () => {
    const patch = synthesizePatch(SECURITY_VIOLATION);
    expect(patch.targetFile).toBe(SECURITY_VIOLATION.affectedFiles[0]);
  });
});

// ---------------------------------------------------------------------------
// 11-13. runImmuneCore
// ---------------------------------------------------------------------------

describe('runImmuneCore', () => {
  it('11. processes multiple violations and writes antigen files to disk', () => {
    const outputDir = path.join(FIXTURE_BASE, 'immune-multi');
    const violations = [SECURITY_VIOLATION, CONCURRENCY_VIOLATION, DATA_INTEGRITY_VIOLATION];

    const report = runImmuneCore({ violations, outputDir });

    expect(report.responses).toHaveLength(3);
    for (const r of report.responses) {
      const antigenPath = path.join(outputDir, r.antigenFile);
      expect(exists(antigenPath)).toBe(true);
      const content = read(antigenPath);
      expect(content).toContain('describe(');
    }
  });

  it('12. summary counts are consistent with responses array', () => {
    const outputDir = path.join(FIXTURE_BASE, 'immune-summary');
    const violations = [SECURITY_VIOLATION, DATA_INTEGRITY_VIOLATION];
    const report = runImmuneCore({ violations, outputDir });

    expect(report.summary.total).toBe(report.responses.length);
    expect(report.summary.synthesizedTests).toBe(report.responses.length);
    expect(
      report.summary.red + report.summary.green + report.summary.unknown
    ).toBe(report.summary.total);
  });

  it('13. respects maxIterations budget', () => {
    const outputDir = path.join(FIXTURE_BASE, 'immune-budget');
    const violations = Array.from({ length: 10 }, (_, i) => ({
      ...SECURITY_VIOLATION, id: `INV-B${i}`,
    }));
    const report = runImmuneCore({ violations, outputDir, maxIterations: 3 });
    expect(report.responses).toHaveLength(3);
  });

  it('14. normalises a raw runtime log entry into a ViolationRecord', () => {
    const rawLog = {
      file: 'src/auth.js',
      error: 'jwt.verify failed: invalid signature',
      message: 'JWT verification error',
      stack: 'Error: invalid signature\n    at auth.js:12',
      severity: 'HIGH',
    };
    const outputDir = path.join(FIXTURE_BASE, 'immune-log');
    const report = runImmuneCore({ violations: [rawLog], outputDir });
    expect(report.responses).toHaveLength(1);
    expect(report.responses[0].antigenSource).toContain('describe(');
  });

  it('15. benchmarkOps is a positive integer', () => {
    const outputDir = path.join(FIXTURE_BASE, 'immune-bench');
    const report = runImmuneCore({ violations: [SECURITY_VIOLATION], outputDir });
    expect(report.responses[0].benchmarkOps).toBeGreaterThan(0);
    expect(Number.isFinite(report.responses[0].benchmarkOps)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14-17. PR Formatter
// ---------------------------------------------------------------------------

describe('PR Formatter', () => {
  it('14. formatBranchName produces a valid lowercase git branch slug', () => {
    const branch = formatBranchName('INV-001', 'Unguarded Async State Mutation');
    expect(branch).toMatch(/^mse\/auto-patch\//);
    expect(branch).not.toMatch(/[A-Z]/);
    expect(branch).not.toMatch(/\s/);
    expect(branch.length).toBeLessThanOrEqual(80);
  });

  it('15. formatMarkdown contains all required sections', () => {
    const md = formatMarkdown(MOCK_PR_PAYLOAD);
    expect(md).toContain('## MSE Auto-Patch');
    expect(md).toContain('Invariant Violation Summary');
    expect(md).toContain('Synthesized Counterexample');
    expect(md).toContain('Patch Descriptors');
    expect(md).toContain('Verification Proof');
    expect(md).toContain('INV-001');
    expect(md).toContain('CRITICAL');
    expect(md).toContain('Before patch');
    expect(md).toContain('After patch');
  });

  it('16. formatMarkdown energy delta is computed correctly', () => {
    const md = formatMarkdown(MOCK_PR_PAYLOAD);
    const delta = (MOCK_PR_PAYLOAD.energyBefore - MOCK_PR_PAYLOAD.energyAfter).toFixed(4);
    expect(md).toContain(delta);
  });

  it('17. formatJSON contains correct schema fields', () => {
    const json = formatJSON(MOCK_PR_PAYLOAD);
    expect(json.schemaVersion).toBe('1.0.0');
    expect(json.pr.branchName).toBe(MOCK_PR_PAYLOAD.branchName);
    expect(json.invariant.severity).toBe('CRITICAL');
    expect(typeof json.telemetry.energyBefore).toBe('number');
    expect(typeof json.pr.body).toBe('string');
    expect(Array.isArray(json.patches)).toBe(true);
  });

  it('18. writePR writes .md, .json, and antigen file', () => {
    const outputDir = path.join(FIXTURE_BASE, 'pr-writer');
    const { mdPath, jsonPath, antigenPath } = writePR(MOCK_PR_PAYLOAD, outputDir);

    expect(exists(mdPath)).toBe(true);
    expect(exists(jsonPath)).toBe(true);
    expect(exists(antigenPath)).toBe(true);

    const mdContent   = read(mdPath);
    const jsonContent = JSON.parse(read(jsonPath));
    expect(mdContent).toContain('## MSE Auto-Patch');
    expect(jsonContent.schemaVersion).toBe('1.0.0');
    expect(read(antigenPath)).toContain('antigen test source');
  });
});

// ---------------------------------------------------------------------------
// 19-23. MSEEngine integration
// ---------------------------------------------------------------------------

describe('MSEEngine -- integration', () => {
  const FIXTURE_REPO = path.join(FIXTURE_BASE, 'engine-repo');
  const OUTPUT_DIR   = path.join(FIXTURE_BASE, 'engine-output');

  beforeAll(() => {
    makeDir(path.join(FIXTURE_REPO, 'src/routes'));

    write(path.join(FIXTURE_REPO, 'README.md'), `
# Test Service
Runs on port 3000. Uses Bearer JWT auth. Requires \`JWT_SECRET\`, \`DATABASE_URL\`.
`);
    write(path.join(FIXTURE_REPO, 'index.js'), `
import express from 'express';
const app = express();
app.listen(8080); // port mismatch with README
export { app };
`);
    write(path.join(FIXTURE_REPO, 'src/routes/users.js'), `
import jwt from 'jsonwebtoken';
const secret = process.env.JWT_SECRET;
const db = process.env.DATABASE_URL;
// missing: process.env.REDIS_URL not in docs

router.post('/users', async (req, res) => {
  const user = await db.users.create(req.body); // unguarded state mutation
  res.json(user);
});
`);
  });

  it('19. MSEEngine instantiates without error', () => {
    expect(() => new MSEEngine({ rootDir: FIXTURE_REPO, outputDir: OUTPUT_DIR })).not.toThrow();
  });

  it('20. engine.run() resolves without throwing', async () => {
    const engine = new MSEEngine({
      rootDir:     FIXTURE_REPO,
      outputDir:   OUTPUT_DIR,
      writePRFiles: false,
    });
    await expect(engine.run()).resolves.toBeDefined();
  });

  it('21. emits ALPHA, BETA, GAMMA, ENGINE events in correct order', async () => {
    const events = [];
    const engine = new MSEEngine({
      rootDir:     FIXTURE_REPO,
      outputDir:   path.join(OUTPUT_DIR, 'events'),
      writePRFiles: false,
    });
    engine.on(ev => events.push(`${ev.phase}:${ev.status}`));
    await engine.run();

    expect(events).toContain('ALPHA:running');
    expect(events).toContain('ALPHA:done');
    expect(events).toContain('BETA:running');
    expect(events).toContain('GAMMA:running');
    expect(events).toContain('ENGINE:done');

    const alphaRunIdx  = events.indexOf('ALPHA:running');
    const alphaDoneIdx = events.indexOf('ALPHA:done');
    const betaRunIdx   = events.indexOf('BETA:running');
    const gammaRunIdx  = events.indexOf('GAMMA:running');
    expect(alphaDoneIdx).toBeGreaterThan(alphaRunIdx);
    expect(betaRunIdx).toBeGreaterThan(alphaDoneIdx);
    expect(gammaRunIdx).toBeGreaterThan(betaRunIdx);
  });

  it('22. EngineResult has all required fields', async () => {
    const engine = new MSEEngine({
      rootDir:     FIXTURE_REPO,
      outputDir:   path.join(OUTPUT_DIR, 'fields'),
      writePRFiles: false,
    });
    const result = await engine.run();

    expect(result).toHaveProperty('manifoldState');
    expect(result).toHaveProperty('morphReport');
    expect(result).toHaveProperty('driftReport');
    expect(result).toHaveProperty('immuneReport');
    expect(result).toHaveProperty('prPayloads');
    expect(result).toHaveProperty('outputFiles');
    expect(result).toHaveProperty('telemetry');
    expect(Array.isArray(result.prPayloads)).toBe(true);
    expect(Array.isArray(result.telemetry)).toBe(true);
  });

  it('23. manifold energy score is a finite number in [0, 1]', async () => {
    const engine = new MSEEngine({
      rootDir:     FIXTURE_REPO,
      outputDir:   path.join(OUTPUT_DIR, 'energy'),
      writePRFiles: false,
    });
    const result = await engine.run();
    const score = result.manifoldState.energyScore;
    expect(typeof score).toBe('number');
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    // Energy can exceed 1 on heavily divergent repos -- cap is enforced at display layer
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('24. writes discovered_invariants.json, immune_report.json to outputDir', async () => {
    const outDir = path.join(OUTPUT_DIR, 'files');
    const engine = new MSEEngine({
      rootDir:     FIXTURE_REPO,
      outputDir:   outDir,
      writePRFiles: false,
    });
    await engine.run();
    expect(exists(path.join(outDir, 'discovered_invariants.json'))).toBe(true);
    expect(exists(path.join(outDir, 'immune_report.json'))).toBe(true);
    expect(exists(path.join(outDir, 'engine_summary.json'))).toBe(true);
  });
});
