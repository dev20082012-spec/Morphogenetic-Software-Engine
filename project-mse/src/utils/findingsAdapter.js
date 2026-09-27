/**
 * Findings Adapter Utility
 *
 * Normalizes findings across Alpha (Call-Graph / Security), Beta (Specification Drift),
 * and Invariant modules into a unified, human-readable structure for the UI.
 *
 * Computes:
 * - Deterministic "Why did MSE flag this?" explanations based on engine evidence
 * - FindingEvidenceChain models connecting Finding → Evidence → Invariant → Counterexample → Patch → Verification
 * - Blast radius & affected dependency paths via Alpha repository graph
 */

import { calculateBlastRadius } from '../engine/repositoryGraph/blastRadius.js';
import { computeFindingCapabilities } from '../engine/capabilities.js';
import { computeRevisionId } from '../engine/patchLifecycle.js';

/**
 * @typedef {{
 *   findingId: string,
 *   title: string,
 *   sourceEvidence: Array<{ file: string, line: number, excerpt: string, context?: string }>,
 *   documentationEvidence: Array<{ file: string, line: number, excerpt: string, context?: string }>,
 *   invariant: object | null,
 *   counterexample: object | null,
 *   patch: object | null,
 *   verification: {
 *     status: 'VERIFIED' | 'NEEDS_REVIEW' | 'REJECTED',
 *     checks: Array<{ name: string, passed: boolean, rationale?: string }>
 *   }
 * }} FindingEvidenceChain
 */

/**
 * Generate a deterministic "Why Did MSE Flag This?" explanation directly from evidence.
 */
function generateWhyFlagged(f, sourceEvidence, docEvidence) {
  if (f.origin === 'beta' || f.type === 'drift') {
    const doc = docEvidence[0];
    const src = sourceEvidence[0];
    if (doc && src) {
      return `MSE flagged this because ${doc.file} (line ${doc.line}) claims: "${doc.excerpt.trim()}", but the actual code in ${src.file} (line ${src.line}) executes: "${src.excerpt.trim()}".`;
    }
    return `MSE flagged this because documentation claims do not match source code implementation.`;
  }

  // Alpha security or data-integrity findings
  const src = sourceEvidence[0];
  if (f.title?.toLowerCase().includes('unguarded')) {
    return `MSE flagged this because route registration in ${src?.file || 'handler'} (line ${src?.line || 1}) performs state mutations via async handlers without authentication or signature verification middleware in its chain.`;
  }

  if (f.title?.toLowerCase().includes('transaction')) {
    return `MSE flagged this because a database transaction is opened at ${src?.file || 'code'}:${src?.line || 1} without an enclosing try/catch or guaranteed rollback handler, risking database connection locks on runtime failure.`;
  }

  if (f.title?.toLowerCase().includes('helper')) {
    return `MSE flagged this because a signature verification helper exists in the repository, but the webhook ingress route in ${src?.file || 'file'} fails to import or call it.`;
  }

  return f.description || `MSE flagged this based on static AST invariant verification.`;
}

/**
 * Format Gamma counterexample with structured trigger, path, and violation details.
 */
function formatCounterexample(rawCx, finding, primaryFile) {
  if (!rawCx) return null;

  return {
    id: rawCx.id,
    findingId: rawCx.findingId || finding.id,
    invariantId: rawCx.invariantId,
    problem: finding.title,
    trigger: rawCx.scenario || 'Unauthenticated request with forged or omitted cryptographic signature headers.',
    executionPath: [
      `Client HTTP Request`,
      `Route: ${primaryFile}`,
      `State Mutation / Transaction Branch`,
      `Invariant Violated`
    ],
    expectedBehavior: 'Request must be rejected with HTTP 401/400 prior to invoking state mutations.',
    observedViolation: rawCx.description || 'Request directly invoked state mutation without signature validation.',
    rootCause: rawCx.rootCause || 'Missing authentication guard middleware in Express route registration.',
    testCode: rawCx.testCode || null,
  };
}

/**
 * Build the structured FindingEvidenceChain model.
 */
function buildEvidenceChain(findingId, title, sourceEvidence, docEvidence, invariant, counterexample, patch, impact, activeVerification, isRepaired, verificationStatus, baselineVerification = null) {
  const checks = (activeVerification?.checks || baselineVerification?.checks || []).slice(0, 5);
  return {
    finding: {
      id: findingId,
      title,
    },
    findingId,
    title,
    sourceEvidence,
    documentationEvidence: docEvidence,
    specificationEvidence: docEvidence,
    invariant: invariant || null,
    counterexample: counterexample || null,
    impact: impact || null,
    patch: patch || null,
    candidatePatch: patch || null,
    verification: {
      status: isRepaired ? 'VERIFIED' : (verificationStatus === 'FAILED' ? 'FAILED' : 'NEEDS_REVIEW'),
      checks
    }
  };
}

export function getUnifiedFindings(
  pipelineResult,
  appliedPatchIds = [],
  snapshot = null,
  verificationOrOptions = null,
  currentWorkingRevisionId = null,
  modifications = {},
  isTesting = false,
  appliedPatchRecords = []
) {
  if (!pipelineResult) return [];

  let verification = null;
  let workingRevId = currentWorkingRevisionId;
  let mods = modifications || {};
  let testing = Boolean(isTesting);
  let patchRecords = appliedPatchRecords || [];
  let verificationHistory = [];

  if (verificationOrOptions && typeof verificationOrOptions === 'object') {
    if ('targetFindingId' in verificationOrOptions || 'status' in verificationOrOptions) {
      verification = verificationOrOptions;
    } else {
      // Options object passed
      verification = verificationOrOptions.verification || verificationOrOptions.lastVerificationResult || null;
      workingRevId = verificationOrOptions.workingRevisionId || verificationOrOptions.currentWorkingRevisionId || workingRevId;
      mods = verificationOrOptions.modifications || mods;
      testing = Boolean(verificationOrOptions.isTesting !== undefined ? verificationOrOptions.isTesting : testing);
      patchRecords = verificationOrOptions.appliedPatchRecords || patchRecords;
      verificationHistory = verificationOrOptions.verificationHistory || [];
    }
  }

  // Derive workingRevisionId from snapshot if not explicitly provided
  if (!workingRevId && snapshot) {
    workingRevId = computeRevisionId(snapshot);
  }

  const resolveFindingState = (f, associatedPatch, primaryFile) => {
    const patchApplied = Boolean(
      associatedPatch &&
      Array.isArray(appliedPatchIds) &&
      appliedPatchIds.includes(associatedPatch.id)
    );

    const relatedFiles = [
      primaryFile,
      associatedPatch?.targetFile,
      ...(f.sourceEvidence || []).map(e => e.file),
      ...(f.documentationEvidence || []).map(e => e.file)
    ].filter(Boolean);

    const hasFileMod = relatedFiles.some(file => {
      const m = mods[file];
      return m && m.status !== 'reverted';
    });

    const isModified = patchApplied || hasFileMod;

    // Direct target check: verification must match targetFindingId and tested revision
    const isDirectMatch = Boolean(
      verification &&
      (verification.targetFindingId === f.id || verification.targetFindingId === f.findingId)
    );
    const directTestedRev = verification?.testedRevision || verification?.testedRevisionId;
    const isDirectRevMatch = Boolean(
      verification &&
      workingRevId &&
      directTestedRev === workingRevId
    );

    // History match: check if a prior run on the current revision verified this finding
    const historyMatch = (verificationHistory || []).slice().reverse().find(v =>
      (v.targetFindingId === f.id || v.targetFindingId === f.findingId) &&
      (v.testedRevision || v.testedRevisionId) === workingRevId
    );

    const activeVerification = (isDirectMatch && isDirectRevMatch)
      ? verification
      : (historyMatch || null);

    let verificationStatus = 'UNMODIFIED';
    let isRepaired = false;
    let status = 'Open';

    if (testing) {
      verificationStatus = 'TESTING';
      status = 'Testing';
    } else if (activeVerification) {
      if (activeVerification.status === 'VERIFIED') {
        verificationStatus = 'VERIFIED';
        isRepaired = true;
        status = 'Verified — Resolved';
      } else if (activeVerification.status === 'FAILED') {
        verificationStatus = 'FAILED';
        status = 'Failed — Still Detected';
      } else {
        verificationStatus = 'NEEDS_REVIEW';
        status = 'Needs Review';
      }
    } else if (patchApplied) {
      verificationStatus = 'NOT_VERIFIED';
      status = 'Applied in RAM — Not Verified';
    } else if (isModified) {
      verificationStatus = 'NOT_VERIFIED';
      status = 'Modified — Not Verified';
    } else {
      verificationStatus = 'UNMODIFIED';
      status = 'Open';
    }

    return {
      patchApplied,
      isModified,
      isTesting: testing,
      verificationStatus,
      isRepaired,
      status,
      activeVerification
    };
  };

  const analysisFindings = (pipelineResult.analysis?.findings || []).map((f) => {
    const associatedPatch = pipelineResult.patches?.patches?.find(
      (p) => p.findingId === f.id || p.targetFile === f.sourceEvidence?.[0]?.file
    );
    const primaryFile = f.sourceEvidence?.[0]?.file || 'src/server.ts';
    const primaryLine = f.sourceEvidence?.[0]?.line || 1;
    const sourceEvidence = f.sourceEvidence || [];
    const docEvidence = f.documentationEvidence || [];

    const state = resolveFindingState(f, associatedPatch, primaryFile);

    const rawCx = pipelineResult.counterexamples?.counterexamples?.find(
      (c) => c.findingId === f.id || c.invariantId === f.invariantId
    );
    const associatedInv = pipelineResult.invariants?.invariants?.find(
      (i) => i.id === f.invariantId
    );

    const whyFlagged = generateWhyFlagged(f, sourceEvidence, docEvidence);
    const blastRadius = calculateBlastRadius(primaryFile, pipelineResult.analysis, snapshot);
    const counterexample = formatCounterexample(rawCx, f, primaryFile);
    const evidenceChain = buildEvidenceChain(
      f.id,
      f.title,
      sourceEvidence,
      docEvidence,
      associatedInv,
      counterexample,
      associatedPatch,
      blastRadius,
      state.activeVerification,
      state.isRepaired,
      state.verificationStatus,
      pipelineResult.verification
    );

    const findingObj = {
      id: f.id,
      origin: 'alpha',
      category: f.type === 'security' ? 'Security' : 'Behavior',
      severity: f.severity || 'CRITICAL',
      title: f.title,
      description: f.description,
      whyFlagged,
      blastRadius,
      evidenceChain,
      file: primaryFile,
      line: primaryLine,
      status: state.status,
      patchApplied: state.patchApplied,
      isModified: state.isModified,
      isTesting: state.isTesting,
      verificationStatus: state.verificationStatus,
      isRepaired: state.isRepaired,
      sourceEvidence,
      documentationEvidence: docEvidence,
      counterexample,
      patch: associatedPatch,
      invariant: associatedInv,
      confidence: f.confidence || 'high',
      verification: state.activeVerification
    };

    findingObj.capabilities = computeFindingCapabilities(
      findingObj,
      state.isRepaired,
      true,
      state.activeVerification || pipelineResult.verification
    );
    return findingObj;
  });

  const driftFindings = (pipelineResult.drift?.findings || []).map((f) => {
    const associatedPatch = pipelineResult.patches?.patches?.find(
      (p) => p.findingId === f.id || p.targetFile === f.sourceEvidence?.[0]?.file
    );
    const primaryFile = f.sourceEvidence?.[0]?.file || f.documentationEvidence?.[0]?.file || 'README.md';
    const primaryLine = f.sourceEvidence?.[0]?.line || f.documentationEvidence?.[0]?.line || 1;
    const sourceEvidence = f.sourceEvidence || [];
    const docEvidence = f.documentationEvidence || [];

    const state = resolveFindingState(f, associatedPatch, primaryFile);

    const rawCx = pipelineResult.counterexamples?.counterexamples?.find(
      (c) => c.findingId === f.id
    );

    const whyFlagged = generateWhyFlagged({ ...f, origin: 'beta' }, sourceEvidence, docEvidence);
    const blastRadius = calculateBlastRadius(primaryFile, pipelineResult.analysis, snapshot);
    const counterexample = formatCounterexample(rawCx, f, primaryFile);
    const evidenceChain = buildEvidenceChain(
      f.id,
      f.title,
      sourceEvidence,
      docEvidence,
      null,
      counterexample,
      associatedPatch,
      blastRadius,
      state.activeVerification,
      state.isRepaired,
      state.verificationStatus,
      pipelineResult.verification
    );

    const driftObj = {
      id: f.id,
      origin: 'beta',
      category: 'Documentation Drift',
      severity: f.severity || 'HIGH',
      title: f.title,
      description: f.description,
      whyFlagged,
      blastRadius,
      evidenceChain,
      file: primaryFile,
      line: primaryLine,
      status: state.status,
      patchApplied: state.patchApplied,
      isModified: state.isModified,
      isTesting: state.isTesting,
      verificationStatus: state.verificationStatus,
      isRepaired: state.isRepaired,
      sourceEvidence,
      documentationEvidence: docEvidence,
      counterexample,
      patch: associatedPatch,
      confidence: f.confidence || 'high',
      verification: state.activeVerification
    };

    driftObj.capabilities = computeFindingCapabilities(
      driftObj,
      state.isRepaired,
      true,
      state.activeVerification || pipelineResult.verification
    );
    return driftObj;
  });

  return [...analysisFindings, ...driftFindings];
}
