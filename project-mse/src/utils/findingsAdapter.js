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
function buildEvidenceChain(findingId, title, sourceEvidence, docEvidence, invariant, counterexample, patch, impact, verification, isRepaired) {

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
      status: isRepaired && verification?.status === 'VERIFIED' ? 'VERIFIED' : 'NEEDS_REVIEW',
      checks: (verification?.checks || []).slice(0, 5)
    }
  };
}

export function getUnifiedFindings(pipelineResult, appliedPatchIds = [], snapshot = null) {
  if (!pipelineResult) return [];

  const analysisFindings = (pipelineResult.analysis?.findings || []).map((f) => {
    const associatedPatch = pipelineResult.patches?.patches?.find(
      (p) => p.findingId === f.id || p.targetFile === f.sourceEvidence?.[0]?.file
    );
    const isRepaired = associatedPatch ? appliedPatchIds.includes(associatedPatch.id) : false;
    const rawCx = pipelineResult.counterexamples?.counterexamples?.find(
      (c) => c.findingId === f.id || c.invariantId === f.invariantId
    );
    const associatedInv = pipelineResult.invariants?.invariants?.find(
      (i) => i.id === f.invariantId
    );

    const primaryFile = f.sourceEvidence?.[0]?.file || 'src/server.ts';
    const primaryLine = f.sourceEvidence?.[0]?.line || 1;
    const sourceEvidence = f.sourceEvidence || [];
    const docEvidence = f.documentationEvidence || [];

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
      pipelineResult.verification,
      isRepaired
    );

    return {
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
      status: isRepaired ? 'Repaired in Memory' : 'Open',
      isRepaired,
      sourceEvidence,
      documentationEvidence: docEvidence,
      counterexample,
      patch: associatedPatch,
      invariant: associatedInv,
      confidence: f.confidence || 'high'
    };
  });

  const driftFindings = (pipelineResult.drift?.findings || []).map((f) => {
    const associatedPatch = pipelineResult.patches?.patches?.find(
      (p) => p.findingId === f.id || p.targetFile === f.sourceEvidence?.[0]?.file
    );
    const isRepaired = associatedPatch ? appliedPatchIds.includes(associatedPatch.id) : false;
    const rawCx = pipelineResult.counterexamples?.counterexamples?.find(
      (c) => c.findingId === f.id
    );

    const primaryFile = f.sourceEvidence?.[0]?.file || f.documentationEvidence?.[0]?.file || 'README.md';
    const primaryLine = f.sourceEvidence?.[0]?.line || f.documentationEvidence?.[0]?.line || 1;
    const sourceEvidence = f.sourceEvidence || [];
    const docEvidence = f.documentationEvidence || [];

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
      pipelineResult.verification,
      isRepaired
    );

    return {
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
      status: isRepaired ? 'Repaired in Memory' : 'Open',
      isRepaired,
      sourceEvidence,
      documentationEvidence: docEvidence,
      counterexample,
      patch: associatedPatch,
      confidence: f.confidence || 'high'
    };
  });

  return [...analysisFindings, ...driftFindings];
}
