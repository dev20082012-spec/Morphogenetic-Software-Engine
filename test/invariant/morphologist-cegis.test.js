/**
 * Invariant Tests: Morphologist + CEGIS integration
 *
 * Validates the end-to-end invariant detection and counterexample synthesis
 * pipeline on a controlled synthetic repository fixture.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMorphologist } from '../../src/agents/morphologist.js';
import { runCegis } from '../../src/cegis/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '../fixtures/synthetic-repo');
const OUTPUT_DIR  = path.join(__dirname, '../fixtures/output');

// ---------------------------------------------------------------------------
// Fixture setup: write a minimal synthetic repository for the scanner
// ---------------------------------------------------------------------------

beforeAll(() => {
  fs.mkdirSync(path.join(FIXTURE_DIR, 'src', 'routes'), { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Entry point
  fs.writeFileSync(path.join(FIXTURE_DIR, 'index.js'), `
import express from 'express';
import usersRouter from './src/routes/users.js';
const app = express();
app.use('/api', usersRouter);
app.listen(3000);
export { app };
`, 'utf8');

  // Unguarded route: async + state mutation, no auth
  fs.writeFileSync(path.join(FIXTURE_DIR, 'src', 'routes', 'users.js'), `
import { db } from '../db.js';
export const router = { post: () => {}, get: () => {} };
router.post('/users', async (req, res) => {
  const user = await db.users.create(req.body);  // async boundary + state mutation, no auth
  res.json(user);
});
router.get('/users/:id', async (req, res) => {
  const u = await db.users.findById(req.params.id);
  res.json(u);
});
`, 'utf8');
});

afterAll(() => {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  fs.rmSync(OUTPUT_DIR,  { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Morphologist -- synthetic repo', () => {
  let report;

  beforeAll(() => {
    report = runMorphologist(FIXTURE_DIR, path.join(OUTPUT_DIR, 'discovered_invariants.json'));
  });

  it('detects the entry point', () => {
    expect(report.entryPoints).toContain('index.js');
  });

  it('scans the expected number of source files', () => {
    expect(report.summary.totalFilesScanned).toBeGreaterThanOrEqual(2);
  });

  it('finds route definitions in the routes file', () => {
    expect(report.summary.routeCount).toBeGreaterThan(0);
  });

  it('detects async boundaries', () => {
    expect(report.summary.asyncBoundaryCount).toBeGreaterThan(0);
  });

  it('writes the output JSON to disk', () => {
    const outFile = path.join(OUTPUT_DIR, 'discovered_invariants.json');
    expect(fs.existsSync(outFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    expect(parsed.schemaVersion).toBe('1.0.0');
  });
});

describe('CEGIS -- counterexample synthesis on discovered invariants', () => {
  it('synthesizes test files for each invariant type', () => {
    const mockInvariants = [
      {
        id: 'INV-001',
        type: 'SECURITY',
        name: 'Unguarded Async State Mutation',
        severity: 'CRITICAL',
        affectedFiles: ['src/routes/users.js'],
        evidence: [{ lineNumber: 5, excerpt: 'const user = await db.users.create(req.body);' }],
      },
      {
        id: 'INV-003-db',
        type: 'DATA_INTEGRITY',
        name: 'Unclosed Transaction Boundary',
        severity: 'CRITICAL',
        affectedFiles: ['src/db.js'],
        evidence: [{ lineNumber: 12, excerpt: "await pool.query('BEGIN');" }],
      },
    ];

    const result = runCegis(mockInvariants, OUTPUT_DIR);
    expect(result.synthesizedTests).toBe(2);
    expect(result.patchesGenerated).toBe(2);
    expect(result.testFiles).toHaveLength(2);

    for (const testFile of result.testFiles) {
      expect(fs.existsSync(path.join(OUTPUT_DIR, testFile))).toBe(true);
    }
  });

  it('generates COMMIT/ROLLBACK patch for DATA_INTEGRITY invariants', () => {
    const inv = [{
      id: 'INV-003',
      type: 'DATA_INTEGRITY',
      name: 'Unclosed Transaction',
      severity: 'CRITICAL',
      affectedFiles: ['src/db.js'],
      evidence: [],
    }];
    const result = runCegis(inv, OUTPUT_DIR);
    expect(result.patches[0].diffHint).toMatch(/commit|COMMIT/i);
  });
});
