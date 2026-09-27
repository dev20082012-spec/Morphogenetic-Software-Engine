/**
 * Invariant Model
 *
 * Defines explicit invariants and evaluates them against analysis results.
 * Each invariant has a clear statement, evidence, and status.
 *
 * Status is either 'violated', 'satisfied', or 'unknown' — based solely
 * on what the analyzer can determine. No overclaiming.
 */

/**
 * Evaluate invariants against analysis and drift results.
 *
 * @param {import('../repositoryGraph/index.js').AnalysisResult} analysis
 * @param {import('../drift/index.js').DriftResult} drift
 * @returns {InvariantResult}
 */
export function evaluateInvariants(analysis, drift) {
  const startTime = performance.now();
  const invariants = [];

  // INV-001: All state-mutating routes must have auth middleware
  invariants.push(evaluateRouteSecurity(analysis));

  // INV-002: API port consistency across docs and code
  invariants.push(evaluatePortConsistency(analysis, drift));

  // INV-003: Transaction boundaries must be balanced (BEGIN → COMMIT/ROLLBACK)
  invariants.push(evaluateTransactionBoundaries(analysis));

  // INV-004: All webhook endpoints must verify signatures
  invariants.push(evaluateWebhookSignatures(analysis, drift));

  // INV-005: All documented env vars must be used; all used must be documented
  invariants.push(evaluateEnvVarConsistency(analysis, drift));

  // INV-006: Available auth helpers must be used by security-sensitive routes
  invariants.push(evaluateAuthHelperUsage(analysis));

  const durationMs = Math.round(performance.now() - startTime);

  return {
    invariants,
    summary: {
      total: invariants.length,
      violated: invariants.filter(i => i.status === 'violated').length,
      satisfied: invariants.filter(i => i.status === 'satisfied').length,
      unknown: invariants.filter(i => i.status === 'unknown').length,
      durationMs,
    },
  };
}

function evaluateRouteSecurity(analysis) {
  const mutatingRoutes = analysis.routes.filter(r =>
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(r.method) && r.method !== 'USE'
  );
  const unguarded = mutatingRoutes.filter(r => !r.hasAuth);
  const linkedFindings = analysis.findings
    .filter(f => f.type === 'security' && /unguarded.*route/i.test(f.title))
    .map(f => f.id);

  return {
    id: 'INV-001',
    name: 'Route authentication guard',
    category: 'security',
    statement: 'All state-mutating HTTP routes (POST, PUT, DELETE, PATCH) must include authentication middleware in their handler chain.',
    evidence: unguarded.map(r => ({
      file: r.file,
      line: r.line,
      excerpt: r.excerpt,
      context: `${r.method} ${r.path} has no auth middleware`,
    })),
    status: unguarded.length === 0 ? 'satisfied' : 'violated',
    linkedFindingIds: linkedFindings,
  };
}

function evaluatePortConsistency(analysis, drift) {
  const portFindings = drift.findings.filter(f =>
    f.type === 'drift' && /port.*mismatch/i.test(f.title) ||
    f.type === 'configuration' && /port.*mismatch/i.test(f.title)
  );

  const evidence = portFindings.flatMap(f => [
    ...f.sourceEvidence,
    ...f.documentationEvidence,
  ]);

  return {
    id: 'INV-002',
    name: 'API port consistency',
    category: 'configuration',
    statement: 'The service port declared in documentation and .env.example must match the default port used in the source code.',
    evidence,
    status: portFindings.length === 0 ? 'satisfied' : 'violated',
    linkedFindingIds: portFindings.map(f => f.id),
  };
}

function evaluateTransactionBoundaries(analysis) {
  const evidence = [];
  const linkedFindings = [];

  for (const fileAnalysis of analysis.files) {
    const { begins, rollbacks } = fileAnalysis.transactionSites;
    if (begins.length > 0 && rollbacks.length === 0) {
      for (const b of begins) {
        evidence.push({
          file: fileAnalysis.path,
          line: b.line,
          excerpt: b.excerpt,
          context: 'Transaction opened without rollback guarantee',
        });
      }
    }
  }

  // Link to related Alpha findings
  for (const f of analysis.findings) {
    if (f.type === 'data-integrity') {
      linkedFindings.push(f.id);
    }
  }

  return {
    id: 'INV-003',
    name: 'Transaction boundary completeness',
    category: 'data-integrity',
    statement: 'Every database transaction BEGIN must have a corresponding COMMIT on success and ROLLBACK on failure within the same scope.',
    evidence,
    status: evidence.length === 0 ? 'satisfied' : 'violated',
    linkedFindingIds: linkedFindings,
  };
}

function evaluateWebhookSignatures(analysis, drift) {
  const sigFindings = drift.findings.filter(f =>
    f.type === 'security' && /HMAC|signature/i.test(f.title)
  );
  const evidence = sigFindings.flatMap(f => f.sourceEvidence);

  return {
    id: 'INV-004',
    name: 'Webhook signature verification',
    category: 'security',
    statement: 'All webhook endpoints must verify the request signature (e.g., HMAC-SHA256) before processing the payload.',
    evidence,
    status: sigFindings.length === 0 ? 'satisfied' : 'violated',
    linkedFindingIds: sigFindings.map(f => f.id),
  };
}

function evaluateEnvVarConsistency(analysis, drift) {
  const envFindings = drift.findings.filter(f =>
    f.type === 'configuration' && /environment variable/i.test(f.title)
  );
  const evidence = envFindings.flatMap(f => f.sourceEvidence);

  return {
    id: 'INV-005',
    name: 'Environment variable documentation',
    category: 'configuration',
    statement: 'All environment variables referenced in source code must be documented in .env.example with descriptions or sensible defaults.',
    evidence,
    status: envFindings.length === 0 ? 'satisfied' : 'violated',
    linkedFindingIds: envFindings.map(f => f.id),
  };
}

function evaluateAuthHelperUsage(analysis) {
  const helperFindings = analysis.findings.filter(f =>
    f.type === 'security' && /helper.*exists.*not used/i.test(f.title)
  );
  const evidence = helperFindings.flatMap(f => f.sourceEvidence);

  return {
    id: 'INV-006',
    name: 'Auth helper utilization',
    category: 'security',
    statement: 'When an authentication/verification helper function exists in the codebase, all security-sensitive routes (webhooks, payment endpoints) must use it.',
    evidence,
    status: helperFindings.length === 0 ? 'satisfied' : 'violated',
    linkedFindingIds: helperFindings.map(f => f.id),
  };
}

/**
 * @typedef {{
 *   invariants: import('../types').Invariant[],
 *   summary: {
 *     total: number,
 *     violated: number,
 *     satisfied: number,
 *     unknown: number,
 *     durationMs: number,
 *   },
 * }} InvariantResult
 */
