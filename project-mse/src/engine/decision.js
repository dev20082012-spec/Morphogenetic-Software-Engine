/**
 * Derives the single user-facing MSE decision from real pipeline outputs.
 * This does not perform analysis; it only normalizes the existing evidence.
 */
export function createDecision({ verification, analysis, drift, patches }) {
  const checks = verification?.checks || [];
  const requiredChecks = checks.filter(check => check.required !== false);
  const failedChecks = requiredChecks.filter(check => check.status === 'failed');
  const unavailableChecks = requiredChecks.filter(check => check.status === 'skipped' || !check.status);
  const allRequiredPassed = requiredChecks.length > 0 && requiredChecks.every(check => check.status === 'passed');
  const criticalFailure = failedChecks.some(check =>
    /invariant|finding resolution|patch application/i.test(check.name || '')
  );

  const status = allRequiredPassed
    ? 'VERIFIED'
    : criticalFailure || verification?.status === 'FAILED'
      ? 'REJECTED'
      : 'NEEDS_REVIEW';

  const affectedFiles = [...new Set([
    ...(analysis?.findings || []).flatMap(f => (f.sourceEvidence || []).map(e => e.file)),
    ...(drift?.findings || []).flatMap(f => [
      ...(f.sourceEvidence || []).map(e => e.file),
      ...(f.documentationEvidence || []).map(e => e.file),
    ]),
    ...(patches?.patches || []).map(patch => patch.targetFile),
  ].filter(Boolean))];

  return {
    status,
    reason: status === 'VERIFIED'
      ? 'All required MSE checks passed.'
      : status === 'REJECTED'
        ? failedChecks[0]?.detail || 'A required MSE check failed.'
        : unavailableChecks[0]?.detail || 'Evidence is incomplete or requires review.',
    checks,
    evidence: verification?.evidence || [],
    affectedFiles,
    confidence: status === 'VERIFIED' ? 'high' : status === 'REJECTED' ? 'medium' : 'low',
  };
}
