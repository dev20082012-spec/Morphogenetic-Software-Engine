import { describe, expect, it } from 'vitest';
import { loadEnterpriseFixture } from '../src/engine/ingest/enterpriseRepository.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { applyPatches } from '../src/engine/verify/index.js';
import { createVerificationTarget, resolveWorkingVerification } from '../src/utils/workingVerification.js';

describe('working snapshot verification', () => {
  it('keeps an unchanged original finding in FAILED state', () => {
    const baseline = runPipeline(loadEnterpriseFixture());
    const finding = baseline.analysis.findings[0];
    const target = createVerificationTarget(finding, baseline, 'RUN #001');

    const result = resolveWorkingVerification({
      baselineResult: baseline,
      workingResult: baseline,
      target,
      baselineRevision: 'RUN #001',
      testedRevision: 'RUN #002',
      changedFiles: [target.filePath],
    });

    expect(result.status).toBe('FAILED');
    expect(result.originalFindingState).toBe('REMAINS');
    expect(result.checks.some(check => check.name === 'Original finding resolved' && check.status === 'failed')).toBe(true);
  });

  it('does not promote an un-targeted test to verified', () => {
    const baseline = runPipeline(loadEnterpriseFixture());
    const result = resolveWorkingVerification({
      baselineResult: baseline,
      workingResult: baseline,
      target: null,
      baselineRevision: 'RUN #001',
      testedRevision: 'RUN #002',
    });

    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.checks[0].status).toBe('skipped');
  });

  it('records a real repaired working result rather than a source-change success', () => {
    const snapshot = loadEnterpriseFixture();
    const baseline = runPipeline(snapshot);
    const patch = baseline.patches.patches.find(item => item.targetFile === 'src/api/webhooks.ts');
    const finding = baseline.analysis.findings.find(item => item.sourceEvidence?.some(evidence => evidence.file === 'src/api/webhooks.ts'));
    const target = createVerificationTarget(finding, baseline, 'RUN #001');
    const working = runPipeline(applyPatches(snapshot, [patch]));

    const result = resolveWorkingVerification({
      baselineResult: baseline,
      workingResult: working,
      target,
      baselineRevision: 'RUN #001',
      testedRevision: 'RUN #002',
      changedFiles: ['src/api/webhooks.ts'],
    });

    expect(result.originalFindingState).not.toBe('REMAINS');
    expect(result.status).toBe('VERIFIED');
    expect(result.checks.some(check => check.name === 'Original finding resolved')).toBe(true);
  });

  it('keeps an ambiguous structural rewrite in NEEDS_REVIEW', () => {
    const snapshot = loadEnterpriseFixture();
    const baseline = runPipeline(snapshot);
    const finding = baseline.analysis.findings.find(item => item.id === 'ALPHA-001');
    const target = createVerificationTarget(finding, baseline, 'RUN #001');
    const workingSnapshot = {
      ...snapshot,
      files: snapshot.files.map(file => file.path === target.filePath ? { ...file, content: '' } : file),
    };
    const working = runPipeline(workingSnapshot);

    const result = resolveWorkingVerification({
      baselineResult: baseline,
      workingResult: working,
      target,
      baselineRevision: 'RUN #001',
      testedRevision: 'RUN #002',
      changedFiles: [target.filePath],
    });

    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.checks.some(check => check.name === 'Affected route remains analyzable' && check.status === 'skipped')).toBe(true);
  });
});
