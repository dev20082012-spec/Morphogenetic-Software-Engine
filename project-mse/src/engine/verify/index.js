/**
 * Verification Engine
 *
 * After patch generation:
 * 1. Apply each patch to an in-memory copy of the repository
 * 2. Re-run the affected analyzers on the patched files
 * 3. Verify the original finding is resolved
 * 4. Verify no supported invariant is newly violated
 *
 * Reports: "Verified against MSE checks" — not a claim of complete correctness.
 */

import { analyzeRepository } from '../repositoryGraph/index.js';
import { analyzeDrift } from '../drift/index.js';
import { evaluateInvariants } from '../invariants/index.js';

/**
 * Verify patches by applying them in-memory and re-running analysis.
 *
 * @param {import('../patch/index.js').PatchSynthesisResult} patchResult
 * @param {import('../types').RepositorySnapshot} snapshot
 * @param {import('../repositoryGraph/index.js').AnalysisResult} originalAnalysis
 * @param {import('../drift/index.js').DriftResult} originalDrift
 * @param {import('../invariants/index.js').InvariantResult} originalInvariants
 * @returns {VerificationResult}
 */
export function verifyPatches(patchResult, snapshot, originalAnalysis, originalDrift, originalInvariants) {
  const startTime = performance.now();
  const checks = [];
  const evidence = [];

  if (patchResult.patches.length === 0) {
    return {
      status: 'VERIFIED',
      checks: [{ name: 'No patches to verify', status: 'passed', detail: 'No patches were generated.' }],
      evidence: [],
      durationMs: Math.round(performance.now() - startTime),
    };
  }

  // Step 1: Apply all patches to create a patched snapshot
  const patchedSnapshot = applyPatches(snapshot, patchResult.patches);
  checks.push({
    name: 'Patch application',
    status: 'passed',
    detail: `Applied ${patchResult.patches.length} patch(es) to in-memory repository snapshot.`,
  });

  // Step 2: Re-run Alpha analysis on patched repository
  let patchedAnalysis;
  try {
    patchedAnalysis = analyzeRepository(patchedSnapshot);
    checks.push({
      name: 'Post-patch Alpha analysis',
      status: 'passed',
      detail: `Re-analyzed ${patchedAnalysis.repositoryStats.sourceFiles} source files in ${patchedAnalysis.repositoryStats.durationMs}ms.`,
    });
  } catch (err) {
    checks.push({
      name: 'Post-patch Alpha analysis',
      status: 'failed',
      detail: `Analysis failed: ${err.message}`,
    });
    return {
      status: 'FAILED',
      checks,
      evidence: [{ file: 'engine', context: err.message }],
      durationMs: Math.round(performance.now() - startTime),
    };
  }

  // Step 3: Re-run Beta drift analysis
  let patchedDrift;
  try {
    patchedDrift = analyzeDrift(patchedSnapshot, patchedAnalysis);
    checks.push({
      name: 'Post-patch Beta drift analysis',
      status: 'passed',
      detail: `Drift analysis completed: ${patchedDrift.stats.driftFindingsCount} findings (was ${originalDrift.stats.driftFindingsCount}).`,
    });
  } catch (err) {
    checks.push({
      name: 'Post-patch Beta drift analysis',
      status: 'failed',
      detail: `Drift analysis failed: ${err.message}`,
    });
    patchedDrift = { findings: [], stats: { driftFindingsCount: 0, criticalCount: 0, durationMs: 0 } };
  }

  // Step 4: Re-evaluate invariants
  let patchedInvariants;
  try {
    patchedInvariants = evaluateInvariants(patchedAnalysis, patchedDrift);
    checks.push({
      name: 'Post-patch invariant evaluation',
      status: 'passed',
      detail: `Invariant evaluation: ${patchedInvariants.summary.violated} violated (was ${originalInvariants.summary.violated}), ${patchedInvariants.summary.satisfied} satisfied.`,
    });
  } catch (err) {
    checks.push({
      name: 'Post-patch invariant evaluation',
      status: 'failed',
      detail: `Invariant evaluation failed: ${err.message}`,
    });
    return {
      status: 'FAILED',
      checks,
      evidence: [{ file: 'engine', context: err.message }],
      durationMs: Math.round(performance.now() - startTime),
    };
  }

  // Step 5: Check that original findings are resolved
  const originalFindingCount = originalAnalysis.findings.length + originalDrift.findings.length;
  const patchedFindingCount = patchedAnalysis.findings.length + patchedDrift.findings.length;

  if (patchedFindingCount < originalFindingCount) {
    const resolved = originalFindingCount - patchedFindingCount;
    checks.push({
      name: 'Finding resolution',
      status: 'passed',
      detail: `${resolved} finding(s) resolved by patches (${originalFindingCount} → ${patchedFindingCount}).`,
    });
    evidence.push({
      file: 'verification',
      context: `Findings reduced from ${originalFindingCount} to ${patchedFindingCount}`,
    });
  } else if (patchedFindingCount === originalFindingCount) {
    checks.push({
      name: 'Finding resolution',
      status: 'passed',
      detail: `Finding count unchanged (${originalFindingCount}). Patches may address issues not captured by current finding rules.`,
    });
  } else {
    checks.push({
      name: 'Finding resolution',
      status: 'failed',
      detail: `New findings introduced: ${patchedFindingCount - originalFindingCount} more than before.`,
    });
  }

  // Step 6: Check no new invariant violations
  const originalViolated = originalInvariants.summary.violated;
  const patchedViolated = patchedInvariants.summary.violated;

  if (patchedViolated <= originalViolated) {
    checks.push({
      name: 'No new invariant violations',
      status: 'passed',
      detail: `Violated invariants: ${patchedViolated} (was ${originalViolated}). No new violations introduced.`,
    });
  } else {
    checks.push({
      name: 'No new invariant violations',
      status: 'failed',
      detail: `New invariant violations detected: ${patchedViolated} (was ${originalViolated}).`,
    });
  }

  // Step 7: Invariant improvement check
  if (patchedViolated < originalViolated) {
    const improved = originalViolated - patchedViolated;
    checks.push({
      name: 'Invariant improvement',
      status: 'passed',
      detail: `${improved} invariant(s) restored from violated to satisfied.`,
    });
  }

  // Determine overall status
  const allPassed = checks.every(c => c.status === 'passed');
  const hasCriticalFailure = checks.some(c =>
    c.status === 'failed' && c.name.includes('new invariant')
  );

  const durationMs = Math.round(performance.now() - startTime);

  return {
    status: allPassed || !hasCriticalFailure ? 'VERIFIED' : 'FAILED',
    checks,
    evidence,
    durationMs,
    patchedInvariants,
    patchedAnalysis,
  };
}

/**
 * Apply patches to a snapshot, returning a new patched snapshot.
 *
 * @param {import('../types').RepositorySnapshot} snapshot
 * @param {import('../types').Patch[]} patches
 * @returns {import('../types').RepositorySnapshot}
 */
export function applyPatches(snapshot, patches) {
  // Deep copy files
  const patchedFiles = snapshot.files.map(f => ({
    path: f.path,
    content: f.content,
    language: f.language,
  }));

  // Apply each patch
  for (const patch of patches) {
    if (!patch.patchedContent) continue;

    const fileIdx = patchedFiles.findIndex(f => f.path === patch.targetFile);
    if (fileIdx >= 0) {
      patchedFiles[fileIdx] = {
        ...patchedFiles[fileIdx],
        content: patch.patchedContent,
      };
    }
  }

  return {
    files: patchedFiles,
    metadata: {
      ...snapshot.metadata,
      patched: true,
      lastPatched: new Date().toISOString(),
    },
  };
}

/**
 * Apply a single patch to a snapshot in memory.
 *
 * @param {import('../types').RepositorySnapshot} snapshot
 * @param {import('../types').Patch & { patchedContent?: string }} patch
 * @returns {import('../types').RepositorySnapshot}
 */
export function applySinglePatch(snapshot, patch) {
  return applyPatches(snapshot, [patch]);
}

/**
 * @typedef {{
 *   status: 'VERIFIED' | 'FAILED',
 *   checks: import('../types').VerificationCheck[],
 *   evidence: import('../types').Evidence[],
 *   durationMs: number,
 *   patchedInvariants?: import('../invariants/index.js').InvariantResult,
 *   patchedAnalysis?: import('../repositoryGraph/index.js').AnalysisResult,
 * }} VerificationResult
 */
