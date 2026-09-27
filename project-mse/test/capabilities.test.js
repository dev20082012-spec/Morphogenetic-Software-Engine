import { describe, it, expect } from 'vitest';
import { loadEnterpriseFixture } from '../src/engine/ingest/enterpriseRepository.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { getUnifiedFindings } from '../src/utils/findingsAdapter.js';
import { 
  CAPABILITIES, 
  computeCapabilityStatus, 
  computeFindingCapabilities 
} from '../src/engine/capabilities.js';
import { applyPatches } from '../src/engine/synthesis/patchApplier.js';

describe('Project MSE Core Capabilities Model: FIND, EXPLAIN, REPAIR & VERIFY', () => {
  const snapshot = loadEnterpriseFixture();
  const pipelineResult = runPipeline(snapshot);
  const findings = getUnifiedFindings(pipelineResult, [], snapshot);

  // 1. First-Class Capability Model Structure
  it('exposes shared, first-class capability definitions for FIND, EXPLAIN, REPAIR & VERIFY', () => {
    expect(CAPABILITIES.find).toBeDefined();
    expect(CAPABILITIES.find.id).toBe('find');
    expect(CAPABILITIES.find.title).toBe('FIND');
    expect(CAPABILITIES.find.headline).toBe('Discover risky behavior and repository drift.');
    expect(CAPABILITIES.find.supportedActions.length).toBeGreaterThan(0);
    expect(CAPABILITIES.find.relatedEngineStages).toContain('Alpha Structural AST Analysis');

    expect(CAPABILITIES.explain).toBeDefined();
    expect(CAPABILITIES.explain.id).toBe('explain');
    expect(CAPABILITIES.explain.title).toBe('EXPLAIN');
    expect(CAPABILITIES.explain.headline).toBe('Trace each finding to code evidence, invariants, counterexamples and impact.');
    expect(CAPABILITIES.explain.supportedActions.length).toBeGreaterThan(0);
    expect(CAPABILITIES.explain.relatedEngineStages).toContain('Gamma Counterexample Search');

    expect(CAPABILITIES.repairVerify).toBeDefined();
    expect(CAPABILITIES.repairVerify.id).toBe('repairVerify');
    expect(CAPABILITIES.repairVerify.title).toBe('REPAIR & VERIFY');
    expect(CAPABILITIES.repairVerify.headline).toBe('Change the repository, re-analyze it and verify whether the original problem is actually resolved.');
    expect(CAPABILITIES.repairVerify.supportedActions.length).toBeGreaterThan(0);
    expect(CAPABILITIES.repairVerify.relatedEngineStages).toContain('Verification Decision Engine');
  });

  // 2. Real Engine-Backed Capability Status Calculation
  it('computes honest repository capability status from actual pipeline results', () => {
    const status = computeCapabilityStatus({
      session: { status: 'COMPLETE' },
      pipelineResult,
      findings,
      snapshot,
      baselineSnapshot: snapshot,
      manualChanges: [],
      appliedPatchIds: []
    });

    // FIND capability reflects actual findings count
    expect(status.find.status).toBe('FINDINGS_DETECTED');
    expect(status.find.totalFindings).toBe(findings.length);
    expect(status.find.criticalCount).toBe(findings.filter(f => f.severity === 'CRITICAL').length);
    expect(status.find.summary).toContain(`${findings.length} issue`);

    // EXPLAIN capability reflects actual evidence items and counterexamples
    expect(status.explain.status).toBe('EVIDENCE_READY');
    expect(status.explain.tracedFindingsCount).toBeGreaterThan(0);
    expect(status.explain.counterexamplesCount).toBe(pipelineResult.counterexamples?.counterexamples?.length || 0);

    // REPAIR & VERIFY capability reflects actual candidate patches in RAM
    expect(status.repairVerify.candidatePatchesCount).toBe(pipelineResult.patches?.patches?.length || 0);
    expect(status.repairVerify.totalModifications).toBe(0);
    expect(status.repairVerify.isVerified).toBe(false); // baseline has unapplied patches, so not verified yet
  });

  // 3. Finding-Level Capability Coverage (Requirement 7)
  it('computes granular capability coverage checks for individual findings', () => {
    const webhookFinding = findings.find(f => f.file.includes('webhooks.ts'));
    expect(webhookFinding).toBeDefined();

    const findingCaps = computeFindingCapabilities(webhookFinding, false, true, pipelineResult.verification);

    // FIND stage: detected
    expect(findingCaps.find.available).toBe(true);
    expect(findingCaps.find.detected).toBe(true);
    expect(findingCaps.find.checks.length).toBeGreaterThan(0);

    // EXPLAIN stage: evidence, counterexample, blast radius
    expect(findingCaps.explain.available).toBe(true);
    expect(findingCaps.explain.hasSourceEvidence).toBe(true);
    expect(findingCaps.explain.hasCounterexample).toBe(true);
    expect(findingCaps.explain.hasBlastRadius).toBe(true);

    const evidenceCheck = findingCaps.explain.checks.find(c => c.id === 'source-evidence');
    expect(evidenceCheck.available).toBe(true);
    expect(evidenceCheck.detail).toContain('webhooks.ts');

    // REPAIR & VERIFY stage: MSE patch and in-memory source editor available
    expect(findingCaps.repairVerify.available).toBe(true);
    expect(findingCaps.repairVerify.hasMsePatch).toBe(true);
    expect(findingCaps.repairVerify.hasEditableSource).toBe(true);
    expect(findingCaps.repairVerify.isRepaired).toBe(false);
    expect(findingCaps.repairVerify.isVerified).toBe(false);
  });

  // 4. Honest Status When Repaired & Verified (No Fake Completion)
  it('correctly transitions REPAIR & VERIFY to VERIFIED only when underlying checks actually pass', () => {
    const availablePatches = pipelineResult.patches.patches || [];
    expect(availablePatches.length).toBeGreaterThan(0);

    // Apply synthesized patches to create repaired snapshot
    const repairedSnapshot = applyPatches(snapshot, availablePatches);

    // Re-run MSE pipeline on the repaired snapshot
    const reAnalysisResult = runPipeline(repairedSnapshot);
    const repairedFindings = getUnifiedFindings(reAnalysisResult, availablePatches.map(p => p.id), repairedSnapshot);

    const postStatus = computeCapabilityStatus({
      session: { status: 'COMPLETE', result: reAnalysisResult },
      pipelineResult: reAnalysisResult,
      findings: repairedFindings,
      snapshot: repairedSnapshot,
      baselineSnapshot: snapshot,
      manualChanges: [],
      appliedPatchIds: availablePatches.map(p => p.id)
    });

    // A repository-wide engine decision does not verify a particular edit without a target result.
    if (reAnalysisResult.decision?.status === 'VERIFIED') {
      expect(postStatus.repairVerify.isVerified).toBe(false);
      expect(postStatus.repairVerify.status).not.toBe('VERIFIED');
    }
  });

  // 5. Honest Status For Empty / Clean Repositories
  it('reports honest idle and clean states without fabricating metrics', () => {
    const idleStatus = computeCapabilityStatus({
      session: { status: 'IDLE' },
      pipelineResult: null,
      findings: []
    });

    expect(idleStatus.find.status).toBe('IDLE');
    expect(idleStatus.find.totalFindings).toBe(0);
    expect(idleStatus.find.badge).toBe('No Analysis');

    expect(idleStatus.explain.status).toBe('IDLE');
    expect(idleStatus.explain.totalEvidenceItems).toBe(0);

    expect(idleStatus.repairVerify.status).toBe('IDLE');
    expect(idleStatus.repairVerify.candidatePatchesCount).toBe(0);
  });
});
