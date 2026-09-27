function allFindings(result) {
  return [
    ...(result?.analysis?.findings || []),
    ...(result?.drift?.findings || []),
  ];
}

function findingFiles(finding) {
  return [
    ...(finding?.sourceEvidence || []).map(item => item.file),
    ...(finding?.documentationEvidence || []).map(item => item.file),
  ].filter(Boolean);
}

/** Build a target from the real baseline finding context. */
export function createVerificationTarget(finding, baselineResult, baselineRevision) {
  if (!finding) return null;
  const baselineFinding = allFindings(baselineResult).find(item => item.id === finding.id);
  const linkedInvariant = (baselineResult?.invariants?.invariants || []).find(item =>
    item.linkedFindingIds?.includes(finding.id)
  );
  const invariantId = finding.invariant?.id || baselineFinding?.invariantId || linkedInvariant?.id || null;
  const counterexample = (baselineResult?.counterexamples?.counterexamples || []).find(item =>
    item.findingId === finding.id || (invariantId && item.invariantId === invariantId)
  );

  return {
    findingId: finding.id,
    findingType: finding.type || finding.origin || baselineFinding?.type || 'unknown',
    baselineRevision,
    filePath: finding.file || findingFiles(baselineFinding)[0] || '',
    line: finding.line || baselineFinding?.sourceEvidence?.[0]?.line || null,
    invariantId,
    counterexampleId: counterexample?.id || null,
    affectedFiles: [
      ...new Set([
        ...findingFiles(baselineFinding),
        ...(finding.blastRadius?.impactChain || []),
      ].filter(Boolean)),
    ],
  };
}

/**
 * Compare the working pipeline result to the original, finding-aware baseline.
 * It only evaluates existing engine outputs; it never executes repository code.
 */
export function resolveWorkingVerification({
  baselineResult,
  workingResult,
  target,
  baselineRevision,
  testedRevision,
  changedFiles = [],
  timestamp = new Date().toISOString(),
}) {
  if (!target || !baselineResult) {
    return {
      targetFindingId: target?.findingId || null,
      baselineRevision: baselineRevision || null,
      testedRevision: testedRevision || null,
      status: 'NEEDS_REVIEW',
      originalFindingState: 'AMBIGUOUS',
      invariantResults: [],
      counterexampleResults: [],
      regressionFindings: [],
      evidence: [],
      checks: [{ name: 'Verification target', status: 'skipped', detail: 'Open a finding before testing changes so MSE can compare the original issue.' }],
      timestamp,
    };
  }

  const baselineFindings = allFindings(baselineResult);
  const workingFindings = allFindings(workingResult);
  const originalFinding = baselineFindings.find(item => item.id === target.findingId);
  const remainingFinding = workingFindings.find(item => item.id === target.findingId);
  const checks = [];
  const evidence = [];

  if (!originalFinding) {
    checks.push({ name: 'Original finding mapping', status: 'skipped', detail: 'The baseline finding could not be located for this target.' });
  } else if (remainingFinding) {
    checks.push({
      name: 'Original finding resolved',
      status: 'failed',
      detail: 'Original finding is still detected in the working repository.',
      evidence: [...(remainingFinding.sourceEvidence || []), ...(remainingFinding.documentationEvidence || [])],
    });
    evidence.push(...(remainingFinding.sourceEvidence || []), ...(remainingFinding.documentationEvidence || []));
  } else {
    checks.push({ name: 'Original finding resolved', status: 'passed', detail: 'Original finding is no longer detected in the working repository.' });
  }

  // Preserve the analyzed route shape when the target was a route finding. If the
  // route vanishes entirely, the engine cannot distinguish a repair from removal
  // of the behavior, so it must remain a human review decision.
  const baselineRoutes = (baselineResult?.analysis?.routes || []).filter(route => route.file === target.filePath);
  if (baselineRoutes.length > 0) {
    const workingRoutes = workingResult?.analysis?.routes || [];
    const missingRoute = baselineRoutes.some(route => !workingRoutes.some(candidate =>
      candidate.file === route.file && candidate.method === route.method && candidate.path === route.path
    ));
    checks.push(missingRoute
      ? { name: 'Affected route remains analyzable', status: 'skipped', detail: 'The original route shape changed or could not be mapped in the working analysis.' }
      : { name: 'Affected route remains analyzable', status: 'passed', detail: 'The original route remains present in the working repository graph.' }
    );
  }

  const invariantResults = [];
  if (target.invariantId) {
    const invariant = (workingResult?.invariants?.invariants || []).find(item => item.id === target.invariantId);
    const status = invariant?.status;
    invariantResults.push({ id: target.invariantId, status: status || 'unknown', evidence: invariant?.evidence || [] });
    if (status === 'satisfied') {
      checks.push({ name: 'Relevant invariant satisfied', status: 'passed', detail: `${target.invariantId} is satisfied in the working analysis.`, evidence: invariant.evidence || [] });
    } else if (status === 'violated') {
      checks.push({ name: 'Relevant invariant satisfied', status: 'failed', detail: `${target.invariantId} remains violated in the working analysis.`, evidence: invariant.evidence || [] });
      evidence.push(...(invariant.evidence || []));
    } else {
      checks.push({ name: 'Relevant invariant satisfied', status: 'skipped', detail: `${target.invariantId} could not be evaluated conclusively.` });
    }
  } else {
    checks.push({ name: 'Relevant invariant satisfied', status: 'skipped', detail: 'No invariant was linked to the original finding.' });
  }

  const counterexampleResults = [];
  const relatedCounterexamples = (workingResult?.counterexamples?.counterexamples || []).filter(item =>
    item.findingId === target.findingId || (target.invariantId && item.invariantId === target.invariantId)
  );
  if (target.counterexampleId || target.invariantId) {
    counterexampleResults.push(...relatedCounterexamples.map(item => ({ id: item.id, reproducible: true, evidence: item })));
    if (relatedCounterexamples.length > 0) {
      checks.push({ name: 'Relevant counterexample no longer reproduces', status: 'failed', detail: 'A counterexample for the original finding is still generated.', evidence: relatedCounterexamples });
      evidence.push(...relatedCounterexamples);
    } else {
      checks.push({ name: 'Relevant counterexample no longer reproduces', status: 'passed', detail: 'No counterexample for the original finding was generated from the working analysis.' });
    }
  } else {
    checks.push({ name: 'Relevant counterexample no longer reproduces', status: 'skipped', detail: 'No counterexample was linked to the original finding.' });
  }

  const baselineIds = new Set(baselineFindings.map(item => item.id));
  const relevantFiles = new Set([...changedFiles, ...target.affectedFiles]);
  const regressionFindings = workingFindings.filter(item =>
    !baselineIds.has(item.id) && findingFiles(item).some(file => relevantFiles.has(file))
  );
  if (regressionFindings.length > 0) {
    checks.push({ name: 'New regressions', status: 'failed', detail: `${regressionFindings.length} new relevant finding(s) were introduced.`, evidence: regressionFindings });
  } else {
    checks.push({ name: 'New regressions', status: 'passed', detail: 'No new relevant findings were introduced.' });
  }

  const failed = checks.filter(check => check.status === 'failed');
  const skipped = checks.filter(check => check.status === 'skipped');
  const originalFindingState = remainingFinding ? 'REMAINS' : originalFinding ? 'RESOLVED' : 'AMBIGUOUS';
  const status = failed.length > 0
    ? 'FAILED'
    : originalFindingState === 'RESOLVED' && skipped.length === 0
      ? 'VERIFIED'
      : 'NEEDS_REVIEW';

  return {
    targetFindingId: target.findingId,
    baselineRevision,
    testedRevision,
    status,
    originalFindingState,
    invariantResults,
    counterexampleResults,
    regressionFindings,
    evidence,
    checks,
    timestamp,
  };
}
