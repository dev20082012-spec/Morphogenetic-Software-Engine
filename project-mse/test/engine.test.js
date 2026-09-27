/**
 * MSE Engine — Comprehensive Test Suite
 *
 * Tests every engine module against the bundled demo repository.
 * Every assertion validates real values computed from actual file content.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadDemoRepository, validateSnapshot } from '../src/engine/ingest/index.js';
import { analyzeRepository } from '../src/engine/repositoryGraph/index.js';
import { analyzeDrift } from '../src/engine/drift/index.js';
import { evaluateInvariants } from '../src/engine/invariants/index.js';
import { generateCounterexamples } from '../src/engine/counterexample/index.js';
import { synthesizePatches } from '../src/engine/patch/index.js';
import { verifyPatches } from '../src/engine/verify/index.js';
import { generateReport } from '../src/engine/report/index.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { normalize, basename, extname, dirname, join, resolveRelative, isDangerousPath } from '../src/engine/pathUtils.js';

// ============================================================
// Path Utilities
// ============================================================

describe('pathUtils', () => {
  it('normalize removes traversals and backslashes', () => {
    expect(normalize('src/../db/pool.js')).toBe('db/pool.js');
    expect(normalize('src\\routes\\webhook.js')).toBe('src/routes/webhook.js');
    expect(normalize('./src/./routes/../db/pool.js')).toBe('src/db/pool.js');
  });

  it('basename extracts filename', () => {
    expect(basename('src/routes/webhook.js')).toBe('webhook.js');
    expect(basename('server.js')).toBe('server.js');
    expect(basename('src/routes/webhook.js', '.js')).toBe('webhook');
  });

  it('extname extracts extension', () => {
    expect(extname('server.js')).toBe('.js');
    expect(extname('openapi.yaml')).toBe('.yaml');
    expect(extname('Dockerfile')).toBe('');
  });

  it('dirname extracts directory', () => {
    expect(dirname('src/routes/webhook.js')).toBe('src/routes');
    expect(dirname('server.js')).toBe('.');
  });

  it('join combines path segments', () => {
    expect(join('src', 'routes', 'webhook.js')).toBe('src/routes/webhook.js');
  });

  it('resolveRelative resolves relative imports', () => {
    expect(resolveRelative('src/routes/webhook.js', '../db/pool.js')).toBe('src/db/pool.js');
    expect(resolveRelative('src/routes/webhook.js', './users.js')).toBe('src/routes/users.js');
  });

  it('isDangerousPath detects traversal attacks', () => {
    expect(isDangerousPath('../etc/passwd')).toBe(true);
    expect(isDangerousPath('src/routes/webhook.js')).toBe(false);
  });
});

// ============================================================
// 1. Repository Ingestion
// ============================================================

describe('Ingestion', () => {
  it('loadDemoRepository returns a valid RepositorySnapshot', () => {
    const snapshot = loadDemoRepository();
    expect(snapshot).toBeDefined();
    expect(snapshot.files).toBeInstanceOf(Array);
    expect(snapshot.files.length).toBeGreaterThan(0);
    expect(snapshot.metadata).toBeDefined();
    expect(snapshot.metadata.source).toBe('demo');
    expect(snapshot.metadata.name).toBe('payment-gateway');
  });

  it('demo repository contains expected files', () => {
    const snapshot = loadDemoRepository();
    const paths = snapshot.files.map(f => f.path);

    expect(paths).toContain('server.js');
    expect(paths).toContain('src/routes/webhook.js');
    expect(paths).toContain('src/routes/users.js');
    expect(paths).toContain('src/routes/orders.js');
    expect(paths).toContain('src/db/pool.js');
    expect(paths).toContain('specs/README.md');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('package.json');
  });

  it('each file has content and language', () => {
    const snapshot = loadDemoRepository();
    for (const file of snapshot.files) {
      expect(typeof file.path).toBe('string');
      expect(file.path.length).toBeGreaterThan(0);
      expect(typeof file.content).toBe('string');
      expect(file.content.length).toBeGreaterThan(0);
      expect(typeof file.language).toBe('string');
    }
  });

  it('validateSnapshot passes for demo repository', () => {
    const snapshot = loadDemoRepository();
    const result = validateSnapshot(snapshot);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateSnapshot fails for empty snapshot', () => {
    const result = validateSnapshot({ files: [], metadata: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validateSnapshot fails for null', () => {
    const result = validateSnapshot(null);
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// 2. Alpha — Repository Graph Analysis
// ============================================================

describe('Alpha — Repository Analysis', () => {
  let snapshot;
  let analysis;

  beforeAll(() => {
    snapshot = loadDemoRepository();
    analysis = analyzeRepository(snapshot);
  });

  it('returns repositoryStats with real values', () => {
    const stats = analysis.repositoryStats;
    expect(stats.totalFiles).toBe(snapshot.files.length);
    expect(stats.sourceFiles).toBeGreaterThan(0);
    expect(stats.totalLines).toBeGreaterThan(0);
    expect(stats.totalBytes).toBeGreaterThan(0);
    expect(stats.languages).toContain('javascript');
    expect(stats.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('discovers entry points', () => {
    expect(analysis.entrypoints.length).toBeGreaterThan(0);
    const entryPaths = analysis.entrypoints.map(e => e.file);
    expect(entryPaths).toContain('server.js');
  });

  it('discovers routes from actual code', () => {
    expect(analysis.routes.length).toBeGreaterThan(0);

    // These routes exist in the demo repository source code
    const routePaths = analysis.routes.map(r => `${r.method} ${r.path}`);
    expect(routePaths).toContain('POST /github');
    expect(routePaths).toContain('GET /');
  });

  it('route hasAuth reflects actual middleware presence', () => {
    // Orders routes should have requireAuth middleware
    const ordersRoutes = analysis.routes.filter(r => r.file.includes('orders'));
    for (const route of ordersRoutes) {
      expect(route.hasAuth).toBe(true);
    }

    // Webhook route should NOT have auth middleware
    const webhookRoutes = analysis.routes.filter(r => r.file.includes('webhook'));
    for (const route of webhookRoutes) {
      expect(route.hasAuth).toBe(false);
    }
  });

  it('discovers environment variables from actual code', () => {
    expect(analysis.environmentVariables.length).toBeGreaterThan(0);
    const varNames = analysis.environmentVariables.map(v => v.name);
    expect(varNames).toContain('PORT');
    expect(varNames).toContain('JWT_SECRET');
  });

  it('PORT env var has correct default value from code', () => {
    const portVar = analysis.environmentVariables.find(v => v.name === 'PORT');
    expect(portVar).toBeDefined();
    expect(portVar.defaultValue).toBe('8080');
  });

  it('discovers imports with resolved paths', () => {
    const serverFile = analysis.files.find(f => f.path === 'server.js');
    expect(serverFile).toBeDefined();
    expect(serverFile.imports.length).toBeGreaterThan(0);

    const relativeImports = serverFile.imports.filter(i => i.isRelative);
    expect(relativeImports.length).toBeGreaterThan(0);
  });

  it('discovers exports', () => {
    const webhookController = analysis.files.find(f => f.path.includes('webhookController'));
    expect(webhookController).toBeDefined();
    const exportNames = webhookController.exports.map(e => e.name);
    expect(exportNames).toContain('verifyWebhookSignature');
  });

  it('builds dependency graph', () => {
    expect(Object.keys(analysis.dependencies).length).toBeGreaterThan(0);
  });

  it('generates findings', () => {
    expect(analysis.findings.length).toBeGreaterThan(0);
    for (const f of analysis.findings) {
      expect(f.id).toBeDefined();
      expect(f.type).toBeDefined();
      expect(f.severity).toBeDefined();
      expect(f.title).toBeDefined();
      expect(f.description).toBeDefined();
      expect(f.sourceEvidence).toBeInstanceOf(Array);
      expect(f.confidence).toBeDefined();
    }
  });

  it('finds unguarded webhook route', () => {
    const webhookFinding = analysis.findings.find(f =>
      f.type === 'security' && /webhook/i.test(f.title)
    );
    expect(webhookFinding).toBeDefined();
    expect(['CRITICAL', 'HIGH']).toContain(webhookFinding.severity);
  });

  it('graphEdges has real edges', () => {
    expect(analysis.graphEdges.length).toBeGreaterThan(0);
    for (const edge of analysis.graphEdges) {
      expect(edge.from).toBeDefined();
      expect(edge.to).toBeDefined();
      expect(edge.type).toBeDefined();
    }
  });
});

// ============================================================
// 3. Beta — Drift Reconciliation
// ============================================================

describe('Beta — Drift Analysis', () => {
  let snapshot, analysis, drift;

  beforeAll(() => {
    snapshot = loadDemoRepository();
    analysis = analyzeRepository(snapshot);
    drift = analyzeDrift(snapshot, analysis);
  });

  it('returns drift findings', () => {
    expect(drift.findings.length).toBeGreaterThan(0);
  });

  it('detects port mismatch between README and code', () => {
    const portFinding = drift.findings.find(f =>
      /port.*mismatch/i.test(f.title)
    );
    expect(portFinding).toBeDefined();
    expect(portFinding.sourceEvidence.length).toBeGreaterThan(0);
    expect(portFinding.documentationEvidence.length).toBeGreaterThan(0);
  });

  it('detects HMAC auth claim vs code gap', () => {
    const hmacFinding = drift.findings.find(f =>
      /HMAC/i.test(f.title) || /signature/i.test(f.title)
    );
    expect(hmacFinding).toBeDefined();
    expect(hmacFinding.severity).toBe('CRITICAL');
  });

  it('every finding has required fields', () => {
    for (const f of drift.findings) {
      expect(f.id).toMatch(/^BETA-/);
      expect(f.type).toBeDefined();
      expect(f.severity).toBeDefined();
      expect(f.title).toBeDefined();
      expect(f.description).toBeDefined();
      expect(f.sourceEvidence).toBeInstanceOf(Array);
      expect(f.documentationEvidence).toBeInstanceOf(Array);
      expect(f.confidence).toBeDefined();
    }
  });

  it('provides analysis stats', () => {
    expect(drift.stats.readmeFilesScanned).toBeGreaterThan(0);
    expect(drift.stats.driftFindingsCount).toBe(drift.findings.length);
    expect(drift.stats.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// 4. Invariant Evaluation
// ============================================================

describe('Invariant Model', () => {
  let snapshot, analysis, drift, invariants;

  beforeAll(() => {
    snapshot = loadDemoRepository();
    analysis = analyzeRepository(snapshot);
    drift = analyzeDrift(snapshot, analysis);
    invariants = evaluateInvariants(analysis, drift);
  });

  it('returns invariant array', () => {
    expect(invariants.invariants.length).toBeGreaterThan(0);
  });

  it('each invariant has required schema', () => {
    for (const inv of invariants.invariants) {
      expect(inv.id).toMatch(/^INV-/);
      expect(inv.name).toBeDefined();
      expect(inv.category).toBeDefined();
      expect(inv.statement).toBeDefined();
      expect(inv.evidence).toBeInstanceOf(Array);
      expect(['violated', 'satisfied', 'unknown']).toContain(inv.status);
      expect(inv.linkedFindingIds).toBeInstanceOf(Array);
    }
  });

  it('INV-001 (route auth) is violated', () => {
    const inv = invariants.invariants.find(i => i.id === 'INV-001');
    expect(inv).toBeDefined();
    expect(inv.status).toBe('violated');
    expect(inv.evidence.length).toBeGreaterThan(0);
  });

  it('INV-002 (port consistency) is violated', () => {
    const inv = invariants.invariants.find(i => i.id === 'INV-002');
    expect(inv).toBeDefined();
    expect(inv.status).toBe('violated');
  });

  it('INV-003 (transaction boundaries) is violated', () => {
    const inv = invariants.invariants.find(i => i.id === 'INV-003');
    expect(inv).toBeDefined();
    expect(inv.status).toBe('violated');
  });

  it('INV-004 (webhook signatures) is violated', () => {
    const inv = invariants.invariants.find(i => i.id === 'INV-004');
    expect(inv).toBeDefined();
    expect(inv.status).toBe('violated');
  });

  it('provides summary counts', () => {
    expect(invariants.summary.total).toBe(invariants.invariants.length);
    expect(invariants.summary.violated).toBeGreaterThan(0);
    expect(invariants.summary.violated + invariants.summary.satisfied + invariants.summary.unknown)
      .toBe(invariants.summary.total);
  });
});

// ============================================================
// 5. Gamma — Counterexample Engine
// ============================================================

describe('Gamma — Counterexamples', () => {
  let snapshot, analysis, drift, invariants, counterexamples;

  beforeAll(() => {
    snapshot = loadDemoRepository();
    analysis = analyzeRepository(snapshot);
    drift = analyzeDrift(snapshot, analysis);
    invariants = evaluateInvariants(analysis, drift);
    counterexamples = generateCounterexamples(invariants, analysis, snapshot);
  });

  it('generates counterexamples for violated invariants', () => {
    expect(counterexamples.counterexamples.length).toBeGreaterThan(0);
  });

  it('each counterexample has required schema', () => {
    for (const cx of counterexamples.counterexamples) {
      expect(cx.id).toMatch(/^CX-/);
      expect(cx.findingId).toBeDefined();
      expect(cx.invariantId).toMatch(/^INV-/);
      expect(cx.description.length).toBeGreaterThan(0);
      expect(cx.scenario.length).toBeGreaterThan(0);
      expect(cx.testCode.length).toBeGreaterThan(0);
      expect(cx.rootCause.length).toBeGreaterThan(0);
    }
  });

  it('counterexample test code is valid vitest structure', () => {
    for (const cx of counterexamples.counterexamples) {
      expect(cx.testCode).toContain('describe(');
      expect(cx.testCode).toContain('it(');
      expect(cx.testCode).toContain('expect(');
    }
  });

  it('provides summary', () => {
    expect(counterexamples.summary.generated).toBe(counterexamples.counterexamples.length);
    expect(counterexamples.summary.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// 6. Patch Synthesis
// ============================================================

describe('Patch Synthesis', () => {
  let snapshot, analysis, drift, invariants, patches;

  beforeAll(() => {
    snapshot = loadDemoRepository();
    analysis = analyzeRepository(snapshot);
    drift = analyzeDrift(snapshot, analysis);
    invariants = evaluateInvariants(analysis, drift);
    patches = synthesizePatches(invariants, analysis, snapshot);
  });

  it('generates patches for violated invariants', () => {
    expect(patches.patches.length).toBeGreaterThan(0);
  });

  it('each patch has required schema', () => {
    for (const patch of patches.patches) {
      expect(patch.id).toMatch(/^PATCH-/);
      expect(patch.targetFile).toBeDefined();
      expect(patch.strategy).toBeDefined();
      expect(patch.description.length).toBeGreaterThan(0);
      expect(patch.diff.length).toBeGreaterThan(0);
      expect(patch.filesChanged).toBeInstanceOf(Array);
      expect(patch.filesChanged.length).toBeGreaterThan(0);
      expect(['high', 'medium', 'low']).toContain(patch.confidence);
    }
  });

  it('patch diffs are unified diff format', () => {
    for (const patch of patches.patches) {
      expect(patch.diff).toContain('--- a/');
      expect(patch.diff).toContain('+++ b/');
      expect(patch.diff).toContain('@@');
    }
  });

  it('patches target real files from the snapshot', () => {
    const filePaths = snapshot.files.map(f => f.path);
    for (const patch of patches.patches) {
      expect(filePaths).toContain(patch.targetFile);
    }
  });

  it('patchedContent is present and differs from original', () => {
    for (const patch of patches.patches) {
      expect(patch.patchedContent).toBeDefined();
      const originalFile = snapshot.files.find(f => f.path === patch.targetFile);
      expect(originalFile).toBeDefined();
      expect(patch.patchedContent).not.toBe(originalFile.content);
    }
  });

  it('provides summary', () => {
    expect(patches.summary.generated).toBe(patches.patches.length);
    expect(patches.summary.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// 7. Verification
// ============================================================

describe('Verification', () => {
  let snapshot, analysis, drift, invariants, patches, verification;

  beforeAll(() => {
    snapshot = loadDemoRepository();
    analysis = analyzeRepository(snapshot);
    drift = analyzeDrift(snapshot, analysis);
    invariants = evaluateInvariants(analysis, drift);
    patches = synthesizePatches(invariants, analysis, snapshot);
    verification = verifyPatches(patches, snapshot, analysis, drift, invariants);
  });

  it('returns verification status', () => {
    expect(['VERIFIED', 'FAILED']).toContain(verification.status);
  });

  it('ran verification checks', () => {
    expect(verification.checks.length).toBeGreaterThan(0);
  });

  it('each check has required schema', () => {
    for (const check of verification.checks) {
      expect(check.name).toBeDefined();
      expect(['passed', 'failed']).toContain(check.status);
      expect(check.detail).toBeDefined();
    }
  });

  it('patch application check passed', () => {
    const appCheck = verification.checks.find(c => c.name === 'Patch application');
    expect(appCheck).toBeDefined();
    expect(appCheck.status).toBe('passed');
  });

  it('post-patch analysis check passed', () => {
    const analysisCheck = verification.checks.find(c => c.name === 'Post-patch Alpha analysis');
    expect(analysisCheck).toBeDefined();
    expect(analysisCheck.status).toBe('passed');
  });

  it('returns duration', () => {
    expect(verification.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// 8. Report Generation
// ============================================================

describe('Report', () => {
  let report;

  beforeAll(() => {
    const snapshot = loadDemoRepository();
    const analysis = analyzeRepository(snapshot);
    const drift = analyzeDrift(snapshot, analysis);
    const invariants = evaluateInvariants(analysis, drift);
    const counterexamples = generateCounterexamples(invariants, analysis, snapshot);
    const patches = synthesizePatches(invariants, analysis, snapshot);
    const verification = verifyPatches(patches, snapshot, analysis, drift, invariants);

    report = generateReport({
      snapshot,
      analysis,
      drift,
      invariants,
      counterexamples,
      patches,
      verification,
      totalDurationMs: 42,
    });
  });

  it('returns JSON report', () => {
    expect(report.json).toBeDefined();
    expect(report.json.schemaVersion).toBe('1.0.0');
    expect(report.json.summary).toBeDefined();
    expect(report.json.analysis).toBeDefined();
    expect(report.json.drift).toBeDefined();
    expect(report.json.invariants).toBeDefined();
    expect(report.json.counterexamples).toBeDefined();
    expect(report.json.patches).toBeDefined();
    expect(report.json.verification).toBeDefined();
  });

  it('returns Markdown report', () => {
    expect(typeof report.markdown).toBe('string');
    expect(report.markdown.length).toBeGreaterThan(0);
    expect(report.markdown).toContain('# MSE Analysis Report');
    expect(report.markdown).toContain('## Summary');
    expect(report.markdown).toContain('## Findings');
    expect(report.markdown).toContain('## Invariants');
    expect(report.markdown).toContain('## Verification');
    expect(report.markdown).toContain('Verified against MSE checks');
  });

  it('summary has real metrics', () => {
    const s = report.summary;
    expect(s.filesAnalyzed).toBeGreaterThan(0);
    expect(s.routesDiscovered).toBeGreaterThan(0);
    expect(s.totalFindings).toBeGreaterThan(0);
    expect(s.patchesGenerated).toBeGreaterThan(0);
    expect(s.invariantsEvaluated).toBeGreaterThan(0);
  });

  it('JSON is serializable', () => {
    const str = JSON.stringify(report.json);
    expect(str.length).toBeGreaterThan(0);
    const parsed = JSON.parse(str);
    expect(parsed.schemaVersion).toBe('1.0.0');
  });
});

// ============================================================
// Pipeline (Full Integration)
// ============================================================

describe('Pipeline — Full Integration', () => {
  let result;
  let telemetryEvents;

  beforeAll(() => {
    telemetryEvents = [];
    const snapshot = loadDemoRepository();
    result = runPipeline(snapshot, {
      onEvent: (evt) => telemetryEvents.push(evt),
    });
  });

  it('returns complete pipeline result', () => {
    expect(result.snapshot).toBeDefined();
    expect(result.analysis).toBeDefined();
    expect(result.drift).toBeDefined();
    expect(result.invariants).toBeDefined();
    expect(result.counterexamples).toBeDefined();
    expect(result.patches).toBeDefined();
    expect(result.verification).toBeDefined();
    expect(result.report).toBeDefined();
    expect(result.telemetry).toBeInstanceOf(Array);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('emitted telemetry events for all phases', () => {
    const phases = telemetryEvents.map(e => e.phase);
    expect(phases).toContain('ALPHA');
    expect(phases).toContain('BETA');
    expect(phases).toContain('INVARIANTS');
    expect(phases).toContain('GAMMA');
    expect(phases).toContain('PATCH');
    expect(phases).toContain('VERIFY');
    expect(phases).toContain('REPORT');
    expect(phases).toContain('PIPELINE');
  });

  it('all phases completed without errors', () => {
    const errorEvents = telemetryEvents.filter(e => e.status === 'error');
    expect(errorEvents).toHaveLength(0);
  });

  it('each telemetry event has timestamp', () => {
    for (const evt of telemetryEvents) {
      expect(evt.timestamp).toBeDefined();
      expect(new Date(evt.timestamp).getTime()).toBeGreaterThan(0);
    }
  });

  it('pipeline discovered real findings', () => {
    const totalFindings = result.analysis.findings.length + result.drift.findings.length;
    expect(totalFindings).toBeGreaterThan(0);
  });

  it('pipeline generated real patches', () => {
    expect(result.patches.patches.length).toBeGreaterThan(0);
  });

  it('pipeline verification ran real checks', () => {
    expect(result.verification.checks.length).toBeGreaterThan(0);
  });

  it('report contains accurate metrics matching pipeline data', () => {
    const s = result.report.summary;
    expect(s.filesAnalyzed).toBe(result.analysis.repositoryStats.totalFiles);
    expect(s.routesDiscovered).toBe(result.analysis.routes.length);
    expect(s.invariantsEvaluated).toBe(result.invariants.summary.total);
    expect(s.patchesGenerated).toBe(result.patches.summary.generated);
  });
});

// ============================================================
// UI Integration: runPipelineAsync & In-Memory Patch Application
// ============================================================

import { runPipelineAsync, applySinglePatch, applyPatches } from '../src/engine/index.js';
import { parseUnifiedDiff } from '../src/utils/diffUtils.js';

describe('UI Integration & Async Pipeline', () => {
  it('runPipelineAsync emits all 7 required execution stages', async () => {
    const snapshot = loadDemoRepository();
    const stagesSeen = new Set();

    const asyncResult = await runPipelineAsync(snapshot, {
      stageDelayMs: 0, // fast in test
      onEvent: (evt) => {
        stagesSeen.add(evt.phase);
      },
    });

    expect(stagesSeen.has('INGESTING')).toBe(true);
    expect(stagesSeen.has('ANALYZING')).toBe(true);
    expect(stagesSeen.has('RECONCILING')).toBe(true);
    expect(stagesSeen.has('SEARCHING')).toBe(true);
    expect(stagesSeen.has('SYNTHESIZING')).toBe(true);
    expect(stagesSeen.has('VERIFYING')).toBe(true);
    expect(stagesSeen.has('COMPLETE')).toBe(true);

    expect(asyncResult.verification.status).toBe('VERIFIED');
    expect(asyncResult.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('applySinglePatch modifies snapshot content in RAM without altering original', () => {
    const originalSnapshot = loadDemoRepository();
    const webhookFile = originalSnapshot.files.find(f => f.path === 'src/routes/webhook.js');
    expect(webhookFile.content).not.toContain('verifyWebhookSignature');

    const fakePatch = {
      id: 'PATCH-TEST',
      targetFile: 'src/routes/webhook.js',
      patchedContent: webhookFile.content + '\n// PATCHED CONTENT',
    };

    const patchedSnapshot = applySinglePatch(originalSnapshot, fakePatch);

    // Original is untouched
    expect(webhookFile.content).not.toContain('// PATCHED CONTENT');

    // Patched snapshot has new content
    const patchedWebhook = patchedSnapshot.files.find(f => f.path === 'src/routes/webhook.js');
    expect(patchedWebhook.content).toContain('// PATCHED CONTENT');
    expect(patchedSnapshot.metadata.patched).toBe(true);
  });

  it('parseUnifiedDiff parses headers, additions, and removals into structured chunks', () => {
    const sampleDiff = [
      '--- a/src/routes/webhook.js',
      '+++ b/src/routes/webhook.js',
      '@@ -1,5 +1,7 @@',
      ' import express from \'express\';',
      '-const oldVar = 1;',
      '+import { verifyWebhookSignature } from \'../controllers/webhookController.js\';',
      '+const newVar = 2;',
      ' export const router = express.Router();',
    ].join('\n');

    const chunks = parseUnifiedDiff(sampleDiff);
    expect(chunks.length).toBe(1);
    expect(chunks[0].header).toContain('@@ -1,5 +1,7 @@');

    const additions = chunks[0].lines.filter(l => l.type === 'add');
    const removals = chunks[0].lines.filter(l => l.type === 'remove');
    const contexts = chunks[0].lines.filter(l => l.type === 'context');

    expect(additions.length).toBe(2);
    expect(removals.length).toBe(1);
    expect(contexts.length).toBe(2);

    expect(additions[0].text).toContain('verifyWebhookSignature');
    expect(removals[0].text).toContain('const oldVar = 1;');
  });

  it('applying synthesized patches restores violated invariants in re-audit', async () => {
    const baselineSnapshot = loadDemoRepository();
    const initialResult = await runPipelineAsync(baselineSnapshot, { stageDelayMs: 0 });

    const initialViolated = initialResult.invariants.summary.violated;
    expect(initialViolated).toBeGreaterThan(0);

    // Apply all synthesized candidate patches
    const patchedSnapshot = applyPatches(baselineSnapshot, initialResult.patches.patches);

    // Re-run pipeline on the patched snapshot
    const reAuditedResult = await runPipelineAsync(patchedSnapshot, { stageDelayMs: 0 });

    // Violated invariants must decrease
    expect(reAuditedResult.invariants.summary.violated).toBeLessThan(initialViolated);
    expect(reAuditedResult.verification.status).toBe('VERIFIED');
  });
});

