import { describe, it, expect } from 'vitest';
import { loadEnterpriseFixture } from '../src/engine/ingest/enterpriseRepository.js';
import { runPipeline } from '../src/engine/pipeline.js';
import {
  applyPatchAtomically,
  computeRevisionId
} from '../src/engine/patchLifecycle.js';
import { getUnifiedFindings } from '../src/utils/findingsAdapter.js';
import { createVerificationTarget, resolveWorkingVerification } from '../src/utils/workingVerification.js';
import { computeCapabilityStatus } from '../src/engine/capabilities.js';

describe('Project MSE — Applied Must Never Mean Verified (Architectural State Suite)', () => {
  const getTestFixture = () => {
    const base = loadEnterpriseFixture();
    const baselineSnapshot = JSON.parse(JSON.stringify(base));
    const workingSnapshot = JSON.parse(JSON.stringify(base));
    const baselineResult = runPipeline(baselineSnapshot);
    return { baselineSnapshot, workingSnapshot, baselineResult };
  };

  it('A. Finding open -> isRepaired = false, status = Open, verificationStatus = UNMODIFIED', () => {
    const { baselineSnapshot, baselineResult } = getTestFixture();
    const findings = getUnifiedFindings(baselineResult, [], baselineSnapshot);

    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.isRepaired).toBe(false);
      expect(f.patchApplied).toBe(false);
      expect(f.verificationStatus).toBe('UNMODIFIED');
      expect(f.status).toBe('Open');
    }
  });

  it('B. Apply MSE patch -> patchApplied = true, but isRepaired MUST REMAIN FALSE', () => {
    const { baselineSnapshot, workingSnapshot, baselineResult } = getTestFixture();
    const targetFinding = baselineResult.analysis.findings[0];
    const candidatePatch = baselineResult.patches.patches.find(
      p => p.findingId === targetFinding.id || p.targetFile === targetFinding.sourceEvidence?.[0]?.file
    );
    expect(candidatePatch).toBeDefined();

    // Apply patch atomically to working snapshot
    const applied = applyPatchAtomically({
      workingSnapshot,
      baselineSnapshot,
      patch: candidatePatch,
      finding: targetFinding
    });
    expect(applied.ok).toBe(true);

    const findings = getUnifiedFindings(
      baselineResult,
      [candidatePatch.id],
      applied.newSnapshot,
      {
        workingRevisionId: computeRevisionId(applied.newSnapshot),
        appliedPatchRecords: [applied.patchRecord]
      }
    );

    const patchedFinding = findings.find(f => f.id === targetFinding.id);
    expect(patchedFinding).toBeDefined();
    // Critical Rule: APPLIED IN RAM != VERIFIED
    expect(patchedFinding.patchApplied).toBe(true);
    expect(patchedFinding.isRepaired).toBe(false);
    expect(patchedFinding.verificationStatus).toBe('NOT_VERIFIED');
    expect(patchedFinding.status).toBe('Applied in RAM — Not Verified');
  });

  it('C. Apply patch but do NOT test -> finding remains unresolved in counts', () => {
    const { baselineSnapshot, workingSnapshot, baselineResult } = getTestFixture();
    const candidatePatch = baselineResult.patches.patches[0];

    const applied = applyPatchAtomically({
      workingSnapshot,
      baselineSnapshot,
      patch: candidatePatch
    });

    const findings = getUnifiedFindings(
      baselineResult,
      [candidatePatch.id],
      applied.newSnapshot,
      {
        workingRevisionId: computeRevisionId(applied.newSnapshot),
        appliedPatchRecords: [applied.patchRecord]
      }
    );

    const caps = computeCapabilityStatus({
      session: { status: 'COMPLETE', result: baselineResult },
      pipelineResult: baselineResult,
      findings,
      snapshot: applied.newSnapshot,
      appliedPatchIds: [candidatePatch.id]
    });

    // 5 findings, 1 patch applied, 0 verified -> resolvedCount MUST be 0
    expect(caps.find.resolvedCount).toBe(0);
    expect(caps.find.totalFindings).toBe(findings.length);
    // Critical issues must still be counted as unresolved
    const criticalCount = findings.filter(f => f.severity === 'CRITICAL' && !f.isRepaired).length;
    expect(caps.find.criticalCount).toBe(criticalCount);
    expect(criticalCount).toBeGreaterThan(0);
  });

  it('D. Manual edit -> isRepaired = false, isModified = true, status = Modified — Not Verified', () => {
    const { baselineSnapshot, workingSnapshot, baselineResult } = getTestFixture();
    const targetFinding = baselineResult.analysis.findings[0];
    const targetFile = targetFinding.sourceEvidence[0].file;

    // Simulate manual edit without patch
    const file = workingSnapshot.files.find(f => f.path === targetFile);
    file.content += '\n// Manual modification';
    const workingRev = computeRevisionId(workingSnapshot);

    const findings = getUnifiedFindings(
      baselineResult,
      [],
      workingSnapshot,
      {
        workingRevisionId: workingRev,
        modifications: {
          [targetFile]: { filePath: targetFile, status: 'modified' }
        }
      }
    );

    const editedFinding = findings.find(f => f.id === targetFinding.id);
    expect(editedFinding.patchApplied).toBe(false);
    expect(editedFinding.isModified).toBe(true);
    expect(editedFinding.isRepaired).toBe(false);
    expect(editedFinding.verificationStatus).toBe('NOT_VERIFIED');
    expect(editedFinding.status).toBe('Modified — Not Verified');
  });

  it('E. Run Test Changes with bad edit -> FAILED -> isRepaired = false', () => {
    const { baselineSnapshot, baselineResult } = getTestFixture();
    const targetFinding = baselineResult.analysis.findings[0];
    const target = createVerificationTarget(targetFinding, baselineResult, 'RUN #001');

    // A bad edit leaves original finding in working snapshot
    const failedVerification = resolveWorkingVerification({
      baselineResult,
      workingResult: baselineResult, // unmodified/bad working code where finding remains
      target,
      baselineRevision: 'RUN #001',
      testedRevision: 'rev-bad-edit',
      changedFiles: [target.filePath]
    });

    expect(failedVerification.status).toBe('FAILED');
    expect(failedVerification.originalFindingState).toBe('REMAINS');

    const findings = getUnifiedFindings(
      baselineResult,
      [],
      baselineSnapshot,
      {
        verification: failedVerification,
        workingRevisionId: 'rev-bad-edit'
      }
    );

    const evaluatedFinding = findings.find(f => f.id === targetFinding.id);
    expect(evaluatedFinding.isRepaired).toBe(false);
    expect(evaluatedFinding.verificationStatus).toBe('FAILED');
    expect(evaluatedFinding.status).toBe('Failed — Still Detected');
  });

  it('F. Run Test Changes with correct repair -> VERIFIED -> isRepaired = true', () => {
    const { baselineSnapshot, workingSnapshot, baselineResult } = getTestFixture();
    const patch = baselineResult.patches.patches.find(item => item.targetFile === 'src/api/webhooks.ts');
    const targetFinding = baselineResult.analysis.findings.find(
      item => item.sourceEvidence?.some(evidence => evidence.file === 'src/api/webhooks.ts')
    );
    expect(patch).toBeDefined();
    expect(targetFinding).toBeDefined();

    // Apply patch atomically
    const applied = applyPatchAtomically({
      workingSnapshot,
      baselineSnapshot,
      patch,
      finding: targetFinding
    });
    const workingRev = computeRevisionId(applied.newSnapshot);

    // Re-run pipeline on patched code
    const workingPipeline = runPipeline(applied.newSnapshot);
    const target = createVerificationTarget(targetFinding, baselineResult, 'RUN #001');

    const verificationResult = resolveWorkingVerification({
      baselineResult,
      workingResult: workingPipeline,
      target,
      baselineRevision: 'RUN #001',
      testedRevision: workingRev,
      changedFiles: ['src/api/webhooks.ts']
    });

    expect(verificationResult.status).toBe('VERIFIED');
    expect(verificationResult.targetFindingId).toBe(targetFinding.id);

    const findings = getUnifiedFindings(
      baselineResult,
      [patch.id],
      applied.newSnapshot,
      {
        verification: verificationResult,
        workingRevisionId: workingRev,
        appliedPatchRecords: [applied.patchRecord]
      }
    );

    const verifiedFinding = findings.find(f => f.id === targetFinding.id);
    expect(verifiedFinding.patchApplied).toBe(true);
    expect(verifiedFinding.verificationStatus).toBe('VERIFIED');
    expect(verifiedFinding.isRepaired).toBe(true);
    expect(verifiedFinding.status).toBe('Verified — Resolved');
  });

  it('G. Verified revision A -> modify file -> revision B -> old verification invalid -> isRepaired = false', () => {
    const { baselineSnapshot, workingSnapshot, baselineResult } = getTestFixture();
    const patch = baselineResult.patches.patches.find(item => item.targetFile === 'src/api/webhooks.ts');
    const targetFinding = baselineResult.analysis.findings.find(
      item => item.sourceEvidence?.some(evidence => evidence.file === 'src/api/webhooks.ts')
    );

    // 1. Revision A: Patch applied & verified
    const appliedA = applyPatchAtomically({
      workingSnapshot,
      baselineSnapshot,
      patch,
      finding: targetFinding
    });
    const revA = computeRevisionId(appliedA.newSnapshot);
    const verificationRevA = {
      targetFindingId: targetFinding.id,
      testedRevision: revA,
      status: 'VERIFIED',
      checks: [{ name: 'Test check', status: 'passed' }]
    };

    const findingsAtRevA = getUnifiedFindings(
      baselineResult,
      [patch.id],
      appliedA.newSnapshot,
      {
        verification: verificationRevA,
        workingRevisionId: revA
      }
    );
    expect(findingsAtRevA.find(f => f.id === targetFinding.id).isRepaired).toBe(true);

    // 2. User edits a file -> Revision B is born
    const modifiedSnapshotB = JSON.parse(JSON.stringify(appliedA.newSnapshot));
    modifiedSnapshotB.files[0].content += '\n// Post-verification user edit';
    const revB = computeRevisionId(modifiedSnapshotB);
    expect(revB).not.toBe(revA);

    // Evaluate findings against Revision B with old Rev A verification
    const findingsAtRevB = getUnifiedFindings(
      baselineResult,
      [patch.id],
      modifiedSnapshotB,
      {
        verification: verificationRevA, // stale verification tied to revA
        workingRevisionId: revB
      }
    );

    const findingAtRevB = findingsAtRevB.find(f => f.id === targetFinding.id);
    // Critical: Stale verification must NOT apply to Revision B!
    expect(findingAtRevB.isRepaired).toBe(false);
    expect(findingAtRevB.verificationStatus).toBe('NOT_VERIFIED');
    expect(findingAtRevB.status).toBe('Applied in RAM — Not Verified');
  });

  it('H. Overview metrics count only genuine verified resolutions', () => {
    const { baselineSnapshot, workingSnapshot, baselineResult } = getTestFixture();
    const patch = baselineResult.patches.patches[0];

    const applied = applyPatchAtomically({
      workingSnapshot,
      baselineSnapshot,
      patch
    });

    const unverifiedFindings = getUnifiedFindings(
      baselineResult,
      [patch.id],
      applied.newSnapshot,
      {
        workingRevisionId: computeRevisionId(applied.newSnapshot)
      }
    );

    // 5 issues detected, 1 patch applied, 0 verified
    const caps = computeCapabilityStatus({
      session: { status: 'COMPLETE', result: baselineResult },
      pipelineResult: baselineResult,
      findings: unverifiedFindings,
      snapshot: applied.newSnapshot,
      appliedPatchIds: [patch.id]
    });

    expect(caps.find.resolvedCount).toBe(0);
    expect(caps.repairVerify.appliedPatchesCount).toBe(1);
    expect(caps.repairVerify.isVerified).toBe(false);
  });

  it('I. Multiple findings and multiple patches do not mark unrelated findings as repaired', () => {
    const { baselineSnapshot, workingSnapshot, baselineResult } = getTestFixture();
    const findingA = baselineResult.analysis.findings[0];
    const findingB = baselineResult.analysis.findings[1] || baselineResult.drift.findings[0];
    expect(findingA).toBeDefined();
    expect(findingB).toBeDefined();
    expect(findingA.id).not.toBe(findingB.id);

    const patchA = baselineResult.patches.patches.find(p => p.findingId === findingA.id || p.targetFile === findingA.file);
    expect(patchA).toBeDefined();

    // Apply patch A
    const appliedA = applyPatchAtomically({
      workingSnapshot,
      baselineSnapshot,
      patch: patchA,
      finding: findingA
    });
    const revA = computeRevisionId(appliedA.newSnapshot);

    // Verification targeting ONLY findingA
    const verificationFindingA = {
      targetFindingId: findingA.id,
      testedRevision: revA,
      status: 'VERIFIED'
    };

    const findings = getUnifiedFindings(
      baselineResult,
      [patchA.id],
      appliedA.newSnapshot,
      {
        verification: verificationFindingA,
        workingRevisionId: revA
      }
    );

    const evaluatedA = findings.find(f => f.id === findingA.id);
    const evaluatedB = findings.find(f => f.id === findingB.id);

    // Finding A is verified
    expect(evaluatedA.isRepaired).toBe(true);
    expect(evaluatedA.verificationStatus).toBe('VERIFIED');

    // Finding B was NOT targeted, so it MUST NOT be repaired
    expect(evaluatedB.isRepaired).toBe(false);
    expect(evaluatedB.verificationStatus).not.toBe('VERIFIED');
  });
});
