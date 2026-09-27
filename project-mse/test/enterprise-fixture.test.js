/**
 * Canonical MSE Demonstration Fixture Test Suite
 *
 * Validates that `fixtures/enterprise-payment-core`:
 * 1. Contains realistic small enterprise backend architecture
 * 2. Triggers DEMO FINDING #1 — Specification Drift (PORT 3000 vs 8080, HMAC vs RS256)
 * 3. Triggers DEMO FINDING #2 — Webhook Security/Robustness Issue (missing signature verification)
 * 4. Triggers DEMO FINDING #3 — Meaningful multi-file dependency & route graph
 * 5. Generates reproducible counterexample test antigens, atomic patches, and verified homeostasis.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadEnterpriseFixture } from '../src/engine/ingest/index.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { applyPatches } from '../src/engine/verify/index.js';
import fs from 'fs';
import path from 'path';

describe('Canonical Demonstration Fixture: enterprise-payment-core', () => {
  let snapshot;
  let result;

  beforeAll(() => {
    snapshot = loadEnterpriseFixture();
    result = runPipeline(snapshot);
  });

  describe('Repository Structure & Files', () => {
    it('contains all 9 expected enterprise files', () => {
      expect(snapshot.files.length).toBe(9);
      const paths = snapshot.files.map(f => f.path);

      expect(paths).toContain('package.json');
      expect(paths).toContain('README.md');
      expect(paths).toContain('.env.example');
      expect(paths).toContain('src/server.ts');
      expect(paths).toContain('src/config.ts');
      expect(paths).toContain('src/security/auth.ts');
      expect(paths).toContain('src/core/ledger.ts');
      expect(paths).toContain('src/api/webhooks.ts');
      expect(paths).toContain('tests/existing.test.ts');
    });

    it('metadata describes canonical fixture', () => {
      expect(snapshot.metadata.name).toBe('enterprise-payment-core');
      expect(snapshot.metadata.source).toBe('demo');
    });
  });

  describe('Alpha: Repository Graph & Flow (Demo Finding #3)', () => {
    it('analyzes all 5 TypeScript source modules in src/', () => {
      const srcModules = result.analysis.files.filter(f => f.path.startsWith('src/'));
      expect(srcModules.length).toBe(5);
      expect(result.analysis.repositoryStats.sourceFiles).toBe(6);
      expect(result.analysis.repositoryStats.totalLines).toBeGreaterThan(150);
    });

    it('indexes entrypoint server.ts', () => {
      const entryFiles = result.analysis.entrypoints.map(e => e.file);
      expect(entryFiles).toContain('src/server.ts');
    });

    it('indexes multi-file routes across controllers', () => {
      const paths = result.analysis.routes.map(r => r.path);
      expect(paths).toContain('/webhooks/stripe');
      expect(paths).toContain('/health');
      expect(paths).toContain('/api/v1/ledger/balance/:id');
      expect(paths).toContain('/api/v1/ledger/transactions');
    });

    it('identifies environment variables', () => {
      const envNames = result.analysis.environmentVariables.map(e => e.name);
      expect(envNames).toContain('PORT');
      expect(envNames).toContain('DATABASE_URL');
      expect(envNames).toContain('JWT_PUBLIC_KEY');
      expect(envNames).toContain('STRIPE_WEBHOOK_SECRET');
      expect(envNames).toContain('NODE_ENV');
    });

    it('constructs multi-file cross-module dependency relationships', () => {
      const depFiles = Object.keys(result.analysis.dependencies);
      expect(depFiles).toContain('src/server.ts');
      expect(depFiles).toContain('src/api/webhooks.ts');
      expect(depFiles).toContain('src/security/auth.ts');
      expect(depFiles).toContain('src/core/ledger.ts');
    });
  });

  describe('Beta: Specification Drift (Demo Finding #1)', () => {
    it('detects port drift: README says 3000 vs code defaults to 8080', () => {
      const portFindings = result.drift.findings.filter(f =>
        f.title.includes('port mismatch') || f.title.includes('Port mismatch')
      );
      expect(portFindings.length).toBeGreaterThan(0);
      const readmePortFinding = portFindings.find(f =>
        f.documentationEvidence.some(e => e.file.includes('README.md'))
      );
      expect(readmePortFinding).toBeDefined();
      expect(readmePortFinding.description).toContain('3000');
      expect(readmePortFinding.description).toContain('8080');
    });

    it('detects port drift in .env.example vs code', () => {
      const envPortFinding = result.drift.findings.find(f =>
        f.documentationEvidence.some(e => e.file.includes('.env.example'))
      );
      expect(envPortFinding).toBeDefined();
    });

    it('detects authentication scheme drift: README specifies HMAC vs code implements RS256/RSA', () => {
      const authDriftFinding = result.drift.findings.find(f =>
        f.title.includes('Authentication scheme drift') || f.title.includes('specifies HMAC, code implements RS256')
      );
      expect(authDriftFinding).toBeDefined();
      expect(authDriftFinding.type).toBe('drift');
      expect(authDriftFinding.severity).toBe('HIGH');
      expect(authDriftFinding.sourceEvidence[0].file).toBe('src/security/auth.ts');
      expect(authDriftFinding.documentationEvidence[0].file).toBe('README.md');
    });
  });

  describe('Gamma: Webhook Security & CEGIS Prover (Demo Finding #2)', () => {
    it('isolates unverified webhook ingress in api/webhooks.ts', () => {
      const webhookFinding = result.drift.findings.find(f =>
        /requires HMAC auth for webhooks/i.test(f.title)
      );
      expect(webhookFinding).toBeDefined();
      expect(webhookFinding.sourceEvidence[0].file).toBe('src/api/webhooks.ts');
    });

    it('flags invariant INV-004 (Webhook signature verification) as violated', () => {
      const inv004 = result.invariants.invariants.find(i => i.id === 'INV-004');
      expect(inv004).toBeDefined();
      expect(inv004.status).toBe('violated');
    });

    it('flags invariant INV-006 (Auth helper utilization) as violated', () => {
      const inv006 = result.invariants.invariants.find(i => i.id === 'INV-006');
      expect(inv006).toBeDefined();
      expect(inv006.status).toBe('violated');
    });

    it('synthesizes concrete counterexample test antigen', () => {
      const cx = result.counterexamples.counterexamples.find(c => c.invariantId === 'INV-004');
      expect(cx).toBeDefined();
      expect(cx.testCode).toContain('it(\'should reject webhook request when X-Hub-Signature-256 is missing\'');
      expect(cx.scenario).toContain('webhook POST request');
      expect(cx.rootCause).toContain('src/api/webhooks.ts');
    });

    it('synthesizes atomic WEBHOOK_SIGNATURE_GUARD patch', () => {
      const patch = result.patches.patches.find(p => p.strategy === 'WEBHOOK_SIGNATURE_GUARD');
      expect(patch).toBeDefined();
      expect(patch.targetFile).toBe('src/api/webhooks.ts');
      expect(patch.diff).toContain('import { verifyWebhookSignature }');
      expect(patch.diff).toContain('if (!sig || !secret || !verifyWebhookSignature');
    });

    it('synthesizes DOC_PORT_RECONCILIATION patch', () => {
      const portPatches = result.patches.patches.filter(p => p.strategy === 'DOC_PORT_RECONCILIATION');
      expect(portPatches.length).toBeGreaterThan(0);
      const envPatch = portPatches.find(p => p.targetFile.includes('.env'));
      expect(envPatch).toBeDefined();
      expect(envPatch.diff).toContain('8080');
      const readmePatch = portPatches.find(p => p.targetFile.includes('README.md'));
      expect(readmePatch).toBeDefined();
      expect(readmePatch.diff).toContain('8080');
    });
  });

  describe('CEGIS Verification & Homeostasis', () => {
    it('verification checks pass in clean in-memory simulation', () => {
      expect(result.verification.status).toBe('VERIFIED');
      expect(result.verification.checks.length).toBeGreaterThan(0);
      const passed = result.verification.checks.filter(c => c.status === 'passed');
      expect(passed.length).toBe(result.verification.checks.length);
    });

    it('re-auditing patched repository satisfies previously violated invariants', () => {
      const patchedSnapshot = applyPatches(snapshot, result.patches.patches);
      const reAudit = runPipeline(patchedSnapshot);

      const baselineViolated = result.invariants.summary.violated;
      const patchedViolated = reAudit.invariants.summary.violated;

      expect(patchedViolated).toBeLessThan(baselineViolated);
      expect(reAudit.verification.status).toBe('VERIFIED');
    });
  });

  describe('Determinism & Regression Storage', () => {
    it('analysis is 100% deterministic across consecutive runs', () => {
      const run2 = runPipeline(snapshot);

      expect(run2.analysis.repositoryStats.sourceFiles).toBe(result.analysis.repositoryStats.sourceFiles);
      expect(run2.analysis.routes.length).toBe(result.analysis.routes.length);
      expect(run2.drift.findings.length).toBe(result.drift.findings.length);
      expect(run2.invariants.summary.violated).toBe(result.invariants.summary.violated);
      expect(run2.patches.patches.length).toBe(result.patches.patches.length);
      expect(run2.verification.status).toBe(result.verification.status);
    });

    it('stores canonical regression expected output file', () => {
      const expectedOutput = {
        fixtureName: 'enterprise-payment-core',
        recordedAt: new Date().toISOString(),
        summary: result.report.summary,
        findings: [
          ...result.analysis.findings,
          ...result.drift.findings,
        ].map(f => ({
          id: f.id,
          type: f.type,
          severity: f.severity,
          title: f.title,
          description: f.description,
          sourceFile: f.sourceEvidence[0]?.file,
          sourceLine: f.sourceEvidence[0]?.line,
        })),
        invariants: result.invariants.invariants.map(i => ({
          id: i.id,
          name: i.name,
          category: i.category,
          status: i.status,
        })),
        counterexamples: result.counterexamples.counterexamples.map(cx => ({
          id: cx.id,
          invariantId: cx.invariantId,
          description: cx.description,
        })),
        patches: result.patches.patches.map(p => ({
          id: p.id,
          strategy: p.strategy,
          targetFile: p.targetFile,
          confidence: p.confidence,
        })),
        verification: {
          status: result.verification.status,
          checksPassed: result.verification.checks.filter(c => c.status === 'passed').length,
          checksTotal: result.verification.checks.length,
        }
      };

      const fixturesDir = path.resolve(__dirname, '../../fixtures/enterprise-payment-core');
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(fixturesDir, 'expected-audit.json'),
        JSON.stringify(expectedOutput, null, 2),
        'utf-8'
      );

      expect(fs.existsSync(path.join(fixturesDir, 'expected-audit.json'))).toBe(true);
    });
  });
});
