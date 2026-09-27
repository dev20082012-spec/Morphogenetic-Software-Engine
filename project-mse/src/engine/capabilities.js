/**
 * capabilities.js
 *
 * First-Class Capability Model for Project MSE
 *
 * Defines and computes the three core capabilities that MSE provides:
 * 1. FIND — Discover risky behavior, specification/implementation drift, invariant violations and structurally suspicious code.
 * 2. EXPLAIN — Connect a finding to actual repository evidence: source location, evidence, invariant/specification, counterexample, dependency/blast radius and reasoning context.
 * 3. REPAIR & VERIFY — Propose or perform a repository change, re-run MSE against the changed state, determine whether the original issue is actually resolved, and produce verification evidence.
 *
 * All capability states are strictly computed from real engine data, never hardcoded.
 */

export const CAPABILITIES = {
  find: {
    id: 'find',
    title: 'FIND',
    headline: 'Discover risky behavior and repository drift.',
    description: 'Discovers risky behavior, specification/implementation drift, invariant violations and structurally suspicious code using AST static analysis and documentation reconciliation.',
    supportedActions: [
      { id: 'view-findings', label: 'View Findings', screen: 'findings', description: 'Review all issues discovered across security, invariant, and documentation analysis.' },
      { id: 'filter-critical', label: 'Filter Critical Risks', screen: 'findings', description: 'Isolate critical vulnerability findings that risk runtime failure or data loss.' }
    ],
    relatedEngineStages: [
      'Alpha Structural AST Analysis',
      'Beta Specification Reconciliation',
      'Static Invariant Evaluation'
    ],
    relatedScreens: ['findings', 'overview']
  },

  explain: {
    id: 'explain',
    title: 'EXPLAIN',
    headline: 'Trace each finding to code evidence, invariants, counterexamples and impact.',
    description: 'Connects each finding to actual repository evidence: source location, code excerpts, invariant specifications, reproducible counterexamples, blast radius and dependency propagation.',
    supportedActions: [
      { id: 'inspect-evidence', label: 'Inspect Evidence Chain', screen: 'findings', description: 'Walk the complete evidence chain from source code to formal invariant.' },
      { id: 'view-counterexample', label: 'View Counterexample', screen: 'findings', description: 'Inspect the concrete failing test scenario and execution path.' },
      { id: 'view-blast-radius', label: 'Analyze Blast Radius', screen: 'findings', description: 'Explore upstream callers and downstream dependents affected by the finding.' }
    ],
    relatedEngineStages: [
      'Evidence Extractor & Excerpt Matcher',
      'Gamma Counterexample Search',
      'Alpha Dependency Graph'
    ],
    relatedScreens: ['findings', 'source']
  },

  repairVerify: {
    id: 'repairVerify',
    title: 'REPAIR & VERIFY',
    headline: 'Change the repository, re-analyze it and verify whether the original problem is actually resolved.',
    description: 'Proposes or performs in-memory repository changes, re-runs the MSE pipeline against the changed state, deterministically verifies whether original issues are resolved, and produces verification evidence.',
    supportedActions: [
      { id: 'edit-source', label: 'Edit in MSE', screen: 'source', description: 'Interactively edit and repair source code in ephemeral RAM without touching local disk.' },
      { id: 'apply-patch', label: 'Apply Candidate Patch', screen: 'changes', description: 'Review and apply atomic synthesized patches directly in memory.' },
      { id: 'test-changes', label: 'Test Changes in RAM', screen: 'source', description: 'Re-run full MSE verification checks on the edited snapshot to ensure invariants hold.' },
      { id: 'view-verification', label: 'View Verification Gate', screen: 'verification', description: 'Inspect the pass/fail state of all deterministic verification checks.' }
    ],
    relatedEngineStages: [
      'Patch Synthesizer',
      'In-Memory RAM Patcher',
      'Verification Decision Engine'
    ],
    relatedScreens: ['source', 'changes', 'verification']
  }
};

/**
 * Computes the overall capability status for the active repository session.
 * Reflects actual underlying data honestly.
 */
export function computeCapabilityStatus({
  session,
  pipelineResult,
  findings = [],
  snapshot = null,
  baselineSnapshot = null,
  manualChanges = [],
  appliedPatchIds = [],
  lastTestResult = null
}) {
  const safeFindings = Array.isArray(findings) ? findings : [];
  const sessionStatus = session?.status || 'IDLE';
  const isRunning = ['INGESTING', 'ANALYZING', 'RECONCILING', 'SEARCHING', 'SYNTHESIZING', 'VERIFYING'].includes(sessionStatus);
  const isComplete = sessionStatus === 'COMPLETE';

  // 1. FIND Capability Status
  const criticalCount = safeFindings.filter(f => f.severity === 'CRITICAL' && !f.isRepaired).length;
  const highCount = safeFindings.filter(f => f.severity === 'HIGH' && !f.isRepaired).length;
  const securityCount = safeFindings.filter(f => f.category === 'Security' || f.origin === 'alpha').length;
  const driftCount = safeFindings.filter(f => f.category === 'Specification Drift' || f.category === 'Documentation Drift' || f.origin === 'beta').length;
  const resolvedCount = safeFindings.filter(f => f.isRepaired).length;

  let findStatus = 'IDLE';
  let findBadge = 'No Analysis';
  if (isRunning) {
    findStatus = 'ANALYZING';
    findBadge = 'Analyzing Repository...';
  } else if (isComplete) {
    if (safeFindings.length === 0) {
      findStatus = 'CLEAN';
      findBadge = '0 Issues Detected';
    } else {
      findStatus = 'FINDINGS_DETECTED';
      findBadge = `${safeFindings.length} Issues Discovered`;
    }
  }

  // 2. EXPLAIN Capability Status
  const findingsWithSourceEvidence = safeFindings.filter(f => f.sourceEvidence?.length > 0);
  const findingsWithCounterexamples = safeFindings.filter(f => Boolean(f.counterexample));
  const findingsWithBlastRadius = safeFindings.filter(f => Boolean(f.blastRadius?.isAvailable));
  const findingsWithInvariants = safeFindings.filter(f => Boolean(f.invariant));

  const totalEvidenceItems = safeFindings.reduce((acc, f) => {
    return acc + (f.sourceEvidence?.length || 0) + (f.documentationEvidence?.length || 0);
  }, 0);

  let explainStatus = 'IDLE';
  let explainBadge = 'No Evidence';
  if (isRunning) {
    explainStatus = 'TRACING';
    explainBadge = 'Tracing Evidence...';
  } else if (isComplete) {
    if (safeFindings.length === 0) {
      explainStatus = 'CLEAN';
      explainBadge = 'Invariants In Good Standing';
    } else {
      explainStatus = 'EVIDENCE_READY';
      explainBadge = `${findingsWithSourceEvidence.length} of ${safeFindings.length} Traced to Code`;
    }
  }

  // 3. REPAIR & VERIFY Capability Status
  const candidatePatches = pipelineResult?.patches?.patches || [];
  const manualEditsCount = manualChanges.length;
  const appliedPatchesCount = appliedPatchIds.length;
  const totalModifications = manualEditsCount + appliedPatchesCount;

  const lastTestStatus = lastTestResult?.status;
  // A generic repository decision is not proof that a particular working edit fixed its target.
  const isVerified = totalModifications > 0 && lastTestStatus === 'VERIFIED';
  const isRejected = totalModifications > 0 && lastTestStatus === 'FAILED';

  let repairVerifyStatus = 'IDLE';
  let repairVerifyBadge = 'No Changes';
  if (isRunning) {
    repairVerifyStatus = 'VERIFYING';
    repairVerifyBadge = 'Checking Invariants...';
  } else if (isVerified) {
    repairVerifyStatus = 'VERIFIED';
    repairVerifyBadge = 'Changes Verified';
  } else if (isRejected) {
    repairVerifyStatus = 'FAILING';
    repairVerifyBadge = 'Checks Failing';
  } else if (totalModifications > 0) {
    repairVerifyStatus = 'MODIFIED_IN_RAM';
    repairVerifyBadge = `${totalModifications} Changes in RAM`;
  } else if (candidatePatches.length > 0) {
    repairVerifyStatus = 'REPAIRS_AVAILABLE';
    repairVerifyBadge = `${candidatePatches.length} Repairs Available`;
  } else if (isComplete) {
    repairVerifyStatus = 'READY';
    repairVerifyBadge = 'Workspace Ready';
  }

  return {
    find: {
      ...CAPABILITIES.find,
      status: findStatus,
      badge: findBadge,
      totalFindings: safeFindings.length,
      criticalCount,
      highCount,
      securityCount,
      driftCount,
      resolvedCount,
      summary: isComplete
        ? `Found ${safeFindings.length} issue${safeFindings.length === 1 ? '' : 's'} (${criticalCount} critical, ${driftCount} specification drift)`
        : 'Waiting for repository analysis.'
    },

    explain: {
      ...CAPABILITIES.explain,
      status: explainStatus,
      badge: explainBadge,
      totalEvidenceItems,
      tracedFindingsCount: findingsWithSourceEvidence.length,
      counterexamplesCount: findingsWithCounterexamples.length,
      blastRadiusCount: findingsWithBlastRadius.length,
      invariantsCount: findingsWithInvariants.length,
      summary: isComplete
        ? `${findingsWithSourceEvidence.length} finding${findingsWithSourceEvidence.length === 1 ? '' : 's'} linked to exact source code, ${findingsWithCounterexamples.length} reproducible scenario${findingsWithCounterexamples.length === 1 ? '' : 's'}, and ${findingsWithBlastRadius.length} blast radius path${findingsWithBlastRadius.length === 1 ? '' : 's'}.`
        : 'Evidence chains ready upon analysis completion.'
    },

    repairVerify: {
      ...CAPABILITIES.repairVerify,
      status: repairVerifyStatus,
      badge: repairVerifyBadge,
      candidatePatchesCount: candidatePatches.length,
      manualEditsCount,
      appliedPatchesCount,
      totalModifications,
      isVerified,
      isRejected,
      verificationGateStatus: isVerified ? 'VERIFIED' : isRejected ? 'FAILED' : 'NEEDS_REVIEW',
      summary: isVerified
        ? 'Repository invariants verified. Counterexample conditions no longer reproduce in RAM.'
        : totalModifications > 0
        ? `${totalModifications} in-memory modification${totalModifications === 1 ? '' : 's'} ready for verification check.`
        : candidatePatches.length > 0
        ? `${candidatePatches.length} synthesized repair patch${candidatePatches.length === 1 ? '' : 'es'} available for review and in-memory application.`
        : 'Interactive in-memory source editor ready for repairs.'
    }
  };
}

/**
 * Computes finding-level capability stages from actual finding data.
 * Every finding exposes which capability stages are available.
 */
export function computeFindingCapabilities(finding, isRepaired = false, hasEditableSource = true, verification = null) {
  if (!finding) {
    return {
      find: { available: false, detected: false, label: 'No finding', checks: [] },
      explain: { available: false, label: 'No evidence', checks: [] },
      repairVerify: { available: false, label: 'No repair', checks: [] }
    };
  }

  const hasSourceEvidence = (finding.sourceEvidence || []).length > 0;
  const hasDocEvidence = (finding.documentationEvidence || []).length > 0;
  const hasInvariant = Boolean(finding.invariant);
  const hasCounterexample = Boolean(finding.counterexample);
  const hasBlastRadius = Boolean(finding.blastRadius?.isAvailable);
  const hasMsePatch = Boolean(finding.patch);

  const verificationStatus = isRepaired
    ? (finding.evidenceChain?.verification?.status || verification?.status || 'NEEDS_REVIEW')
    : 'UNMODIFIED';

  const isVerified = isRepaired && verificationStatus === 'VERIFIED';

  return {
    find: {
      available: true,
      detected: true,
      label: 'Finding Detected',
      severity: finding.severity || 'MEDIUM',
      category: finding.category || 'Behavior',
      checks: [
        { id: 'route-analyzed', name: 'Source location analyzed', status: hasSourceEvidence ? 'available' : 'unavailable', detail: `${finding.file}:${finding.line}` },
        { id: 'severity-graded', name: `Severity: ${finding.severity || 'MEDIUM'}`, status: 'available', detail: finding.category || 'Behavior' }
      ]
    },

    explain: {
      available: true,
      hasSourceEvidence,
      hasDocEvidence,
      hasInvariant,
      hasCounterexample,
      hasBlastRadius,
      checks: [
        {
          id: 'source-evidence',
          name: 'Source Code Evidence',
          available: hasSourceEvidence,
          detail: hasSourceEvidence ? `${finding.sourceEvidence[0].file}:${finding.sourceEvidence[0].line}` : 'Not isolated'
        },
        {
          id: 'invariant',
          name: 'Invariant Specification',
          available: hasInvariant,
          detail: hasInvariant ? (finding.invariant.name || finding.invariant.id) : 'Implicit AST Invariant'
        },
        {
          id: 'counterexample',
          name: 'Reproducible Counterexample',
          available: hasCounterexample,
          detail: hasCounterexample ? 'Concrete Failing Scenario' : 'Static Risk Pattern'
        },
        {
          id: 'blast-radius',
          name: 'Blast Radius & Impact Chain',
          available: hasBlastRadius,
          detail: hasBlastRadius ? `${finding.blastRadius.dependents?.length || 0} downstream dependents` : 'Single file scope'
        }
      ]
    },

    repairVerify: {
      available: hasMsePatch || hasEditableSource,
      hasMsePatch,
      hasEditableSource,
      isRepaired,
      isVerified,
      verificationStatus,
      checks: [
        {
          id: 'mse-patch',
          name: 'MSE Candidate Patch',
          available: hasMsePatch,
          detail: hasMsePatch ? 'Synthesized in RAM' : 'Manual Edit Recommended'
        },
        {
          id: 'source-editor',
          name: 'In-Memory Source Editor',
          available: hasEditableSource,
          detail: 'RAM Buffer Active'
        },
        {
          id: 'verification',
          name: 'Verification Pipeline Gate',
          available: true,
          detail: isRepaired ? (isVerified ? 'VERIFIED' : 'NEEDS REVIEW') : 'Ready to Test'
        }
      ]
    }
  };
}
