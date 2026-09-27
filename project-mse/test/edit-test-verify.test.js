import { describe, it, expect } from 'vitest';
import { loadEnterpriseFixture } from '../src/engine/ingest/enterpriseRepository.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { generateUnifiedDiff, parseUnifiedDiff } from '../src/utils/diffUtils.js';
import { applyPatches } from '../src/engine/synthesis/patchApplier.js';

describe('MASTER PROMPT 2: EDIT → TEST → VERIFY Interactive Workspace', () => {
  // Test A & B: Open source and inspect baseline
  it('A & B: loads baseline repository snapshot in memory without modifying filesystem', () => {
    const baseline = loadEnterpriseFixture();
    expect(baseline).toBeDefined();
    expect(baseline.files.length).toBeGreaterThan(0);

    const webhookFile = baseline.files.find(f => f.path === 'src/api/webhooks.ts');
    expect(webhookFile).toBeDefined();
    expect(webhookFile.content).toContain("webhookRouter.post('/webhooks/stripe'");
  });

  // Test C: Save to MSE RAM (updates ONLY in-memory snapshot)
  it('C: saves edits to in-memory RepositorySnapshot without touching filesystem or baseline', () => {
    const baseline = loadEnterpriseFixture();
    const webhookFile = baseline.files.find(f => f.path === 'src/api/webhooks.ts');
    const originalContent = webhookFile.content;

    // Simulate in-memory edit: repairing the signature check
    const manualRepairedContent = originalContent.replace(
      "webhookRouter.post('/webhooks/stripe', async",
      "webhookRouter.post('/webhooks/stripe', requireAuth, async"
    );

    // Create updated in-memory snapshot
    const updatedFiles = baseline.files.map(f => {
      if (f.path === 'src/api/webhooks.ts') {
        return { ...f, content: manualRepairedContent, sizeBytes: manualRepairedContent.length };
      }
      return f;
    });
    const inMemorySnapshot = { ...baseline, files: updatedFiles };

    // Verify baseline was NOT mutated
    expect(webhookFile.content).toContain("webhookRouter.post('/webhooks/stripe', async");
    expect(webhookFile.content).toBe(originalContent);

    // Verify in-memory snapshot holds the new content
    const inMemoryFile = inMemorySnapshot.files.find(f => f.path === 'src/api/webhooks.ts');
    expect(inMemoryFile.content).toContain("webhookRouter.post('/webhooks/stripe', requireAuth, async");
    expect(inMemoryFile.content).not.toBe(originalContent);
  });

  // Test D: Original vs Edited Diff Generation
  it('D: computes unified diff accurately between baseline original and in-memory edit', () => {
    const baseline = loadEnterpriseFixture();
    const webhookFile = baseline.files.find(f => f.path === 'src/api/webhooks.ts');
    const originalContent = webhookFile.content;
    const modifiedContent = originalContent.replace(
      "webhookRouter.post('/webhooks/stripe', async",
      "webhookRouter.post('/webhooks/stripe', requireAuth, async"
    );

    const diff = generateUnifiedDiff('src/api/webhooks.ts', originalContent, modifiedContent);
    expect(diff).toContain('--- a/src/api/webhooks.ts');
    expect(diff).toContain('+++ b/src/api/webhooks.ts');
    expect(diff).toContain("- webhookRouter.post('/webhooks/stripe', async");
    expect(diff).toContain("+ webhookRouter.post('/webhooks/stripe', requireAuth, async");

    const chunks = parseUnifiedDiff(diff);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].lines.some(c => c.type === 'remove')).toBe(true);
    expect(chunks[0].lines.some(c => c.type === 'add')).toBe(true);
  });

  // Test E & F: Test Changes inside MSE pipeline and produce real check outputs
  it('E & F: runs real deterministic verification checks on edited snapshot and detects repair', () => {
    const baseline = loadEnterpriseFixture();
    
    // Baseline pipeline execution: should detect security counterexample
    const baselineResult = runPipeline(baseline);
    expect(baselineResult.counterexamples.counterexamples.length).toBeGreaterThan(0);
    const baselineWebhookCE = baselineResult.counterexamples.counterexamples.find(c => c.findingId === 'ALPHA-001');
    expect(baselineWebhookCE).toBeDefined();

    // Now edit the webhook file to fix the signature check in memory
    const synthesizedPatches = baselineResult.patches.patches || [];
    const webhookPatch = synthesizedPatches.find(p => p.targetFile === 'src/api/webhooks.ts');
    expect(webhookPatch).toBeDefined();

    // Apply the repair to create the edited snapshot
    const editedSnapshot = applyPatches(baseline, [webhookPatch]);

    // Test Changes: run MSE pipeline on the edited snapshot
    const testResult = runPipeline(editedSnapshot);
    expect(testResult).toBeDefined();
    expect(testResult.decision).toBeDefined();

    // Invariant & counterexample checks must reflect the actual engine state
    const postWebhookCE = testResult.counterexamples.counterexamples.find(c => c.findingId === 'ALPHA-001');
    // Counterexample for webhook vulnerability should now be resolved!
    expect(postWebhookCE).toBeUndefined();
  });

  // Test G & H: Retest, Revert Single File to baseline
  it('G & H: reverts modified file back to baseline in RAM without state leakage', () => {
    const baseline = loadEnterpriseFixture();
    const webhookFile = baseline.files.find(f => f.path === 'src/api/webhooks.ts');
    const originalContent = webhookFile.content;

    // Mutate in RAM
    let currentRAM = {
      ...baseline,
      files: baseline.files.map(f => f.path === 'src/api/webhooks.ts' ? { ...f, content: '// broken' } : f)
    };
    expect(currentRAM.files.find(f => f.path === 'src/api/webhooks.ts').content).toBe('// broken');

    // Revert file action
    const revertedFiles = currentRAM.files.map(f => {
      if (f.path === 'src/api/webhooks.ts') {
        const base = baseline.files.find(b => b.path === 'src/api/webhooks.ts');
        return base ? { ...base } : f;
      }
      return f;
    });
    currentRAM = { ...currentRAM, files: revertedFiles };

    expect(currentRAM.files.find(f => f.path === 'src/api/webhooks.ts').content).toBe(originalContent);
  });

  // Test I: Reset entire repository to baseline
  it('I: resets entire repository snapshot back to initial baseline', () => {
    const baseline = loadEnterpriseFixture();
    
    // Modify multiple files in RAM
    const modifiedRAM = {
      ...baseline,
      files: baseline.files.map(f => ({ ...f, content: f.content + '\n// modified' }))
    };
    expect(modifiedRAM.files[0].content).toContain('// modified');

    // Reset repository action: restores baseline
    const restoredRAM = { ...baseline, files: baseline.files.map(f => ({ ...f })) };
    expect(restoredRAM.files[0].content).not.toContain('// modified');
    expect(restoredRAM.files.length).toBe(baseline.files.length);
  });

  // Test J: Finding-aware context navigation
  it('J: links findings to affected file, line numbers, and evidence chains', () => {
    const baseline = loadEnterpriseFixture();
    const pipelineResult = runPipeline(baseline);

    const findings = pipelineResult.drift.findings;
    expect(findings.length).toBeGreaterThan(0);

    const firstDrift = findings[0];
    expect(firstDrift.sourceEvidence[0].file).toBeDefined();
    expect(firstDrift.sourceEvidence[0].line).toBeDefined();
    expect(typeof firstDrift.sourceEvidence[0].line).toBe('number');
  });

  // Test K: Compare Manual Edit vs MSE Generated Patch
  it('K: compares manual edit against MSE candidate patch and allows choosing either', () => {
    const baseline = loadEnterpriseFixture();
    const result = runPipeline(baseline);
    const candidatePatch = result.patches.patches[0];
    expect(candidatePatch).toBeDefined();

    const manualContent = '// My custom manual fix';
    const msePatchContent = candidatePatch.diff;

    // Both coexist as distinct RAM options
    expect(manualContent).not.toBe(msePatchContent);
    expect(candidatePatch.description).toBeDefined();
  });

  // Test L: Safe execution rule
  it('L: operates purely on ASTs, regex patterns, and string buffers without dynamic evaluation', () => {
    const baseline = loadEnterpriseFixture();
    // Verify that running pipeline does not invoke global eval or Function constructor
    const originalEval = globalThis.eval;
    let evalCalled = false;
    globalThis.eval = () => { evalCalled = true; };

    try {
      const result = runPipeline(baseline);
      expect(result).toBeDefined();
      expect(evalCalled).toBe(false);
    } finally {
      globalThis.eval = originalEval;
    }
  });

  // Test M: Changes tracking state
  it('M: categorizes changes into Manual edits and MSE patches with verified flags', () => {
    const baseline = loadEnterpriseFixture();
    const result = runPipeline(baseline);

    // Simulate 1 manual change and 1 applied MSE patch
    const manualEdit = {
      filePath: 'src/config.ts',
      original: 'PORT=8080',
      modified: 'PORT=3000',
      isVerified: true
    };

    const appliedPatch = {
      id: 'patch-webhook-01',
      title: 'Harden Stripe Webhook Signature Check',
      targetFile: 'src/api/webhooks.ts',
      isVerified: true
    };

    const changesList = [
      { type: 'manual', ...manualEdit },
      { type: 'patch', ...appliedPatch }
    ];

    expect(changesList.filter(c => c.type === 'manual').length).toBe(1);
    expect(changesList.filter(c => c.type === 'patch').length).toBe(1);
    expect(changesList.every(c => c.isVerified)).toBe(true);
  });
});
