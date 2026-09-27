/**
 * Report Generator
 *
 * Generates structured JSON and human-readable Markdown reports
 * from the full pipeline results, including Run ID, evidence chains,
 * blast radius impact paths, and verification gate decisions.
 */

import { calculateBlastRadius } from '../repositoryGraph/blastRadius.js';
import { createDecision } from '../decision.js';

/**
 * Generate complete MSE report.
 *
 * @param {object} params
 * @param {import('../types').RepositorySnapshot} params.snapshot
 * @param {import('../repositoryGraph/index.js').AnalysisResult} params.analysis
 * @param {import('../drift/index.js').DriftResult} params.drift
 * @param {import('../invariants/index.js').InvariantResult} params.invariants
 * @param {import('../counterexample/index.js').CounterexampleResult} params.counterexamples
 * @param {import('../patch/index.js').PatchSynthesisResult} params.patches
 * @param {import('../verify/index.js').VerificationResult} params.verification
 * @param {object} params.decision
 * @param {number} params.totalDurationMs
 * @param {string} [params.runId]
 * @returns {ReportResult}
 */
export function generateReport({
  snapshot,
  analysis,
  drift,
  invariants,
  counterexamples,
  patches,
  verification,
  decision: suppliedDecision,
  totalDurationMs,
  runId = 'RUN #001'
}) {
  const decision = suppliedDecision || createDecision({ verification, analysis, drift, patches });
  const allFindings = [...analysis.findings, ...drift.findings];
  const criticalFindings = allFindings.filter(f => f.severity === 'CRITICAL');

  // Compute blast radius for all findings
  const findingsWithImpact = allFindings.map(f => {
    const primaryFile = f.sourceEvidence?.[0]?.file || f.documentationEvidence?.[0]?.file || '';
    const blastRadius = calculateBlastRadius(primaryFile, analysis, snapshot);
    return {
      ...f,
      blastRadius
    };
  });

  const summary = {
    runId,
    repositoryName: snapshot.metadata.name,
    repositorySource: snapshot.metadata.source || 'demo',
    analyzedAt: new Date().toISOString(),
    filesAnalyzed: analysis.repositoryStats.totalFiles,
    sourceFilesAnalyzed: analysis.repositoryStats.sourceFiles,
    totalLines: analysis.repositoryStats.totalLines,
    routesDiscovered: analysis.routes.length,
    dependenciesDiscovered: Object.values(analysis.dependencies).flat().length,
    environmentVariables: analysis.environmentVariables.length,
    entrypoints: analysis.entrypoints.length,
    totalFindings: allFindings.length,
    criticalFindings: criticalFindings.length,
    highFindings: allFindings.filter(f => f.severity === 'HIGH').length,
    mediumFindings: allFindings.filter(f => f.severity === 'MEDIUM').length,
    lowFindings: allFindings.filter(f => f.severity === 'LOW').length,
    invariantsEvaluated: invariants.summary.total,
    invariantsViolated: invariants.summary.violated,
    invariantsSatisfied: invariants.summary.satisfied,
    counterexamplesGenerated: counterexamples.summary.generated,
    patchesGenerated: patches.summary.generated,
    verificationStatus: decision.status,
    verificationGate: decision.status,
    decision,
    checksPassed: verification.checks.filter(c => c.status === 'passed').length,
    checksTotal: verification.checks.length,
    totalDurationMs,
  };

  const evidenceChains = findingsWithImpact.map(finding => ({
    finding: { id: finding.id, title: finding.title, severity: finding.severity },
    sourceEvidence: finding.sourceEvidence || [],
    specificationEvidence: finding.documentationEvidence || [],
    invariant: invariants.invariants.find(inv => inv.linkedFindingIds?.includes(finding.id)) || null,
    counterexample: counterexamples.counterexamples.find(cx => cx.findingId === finding.id) || null,
    impact: finding.blastRadius,
    candidatePatch: patches.patches.find(patch => patch.findingId === finding.id) || null,
    verification: decision,
  }));
  const json = buildJsonReport(summary, analysis, drift, invariants, counterexamples, patches, verification, decision, findingsWithImpact, evidenceChains);
  const markdown = buildMarkdownReport(summary, findingsWithImpact, invariants, counterexamples, patches, verification, decision, evidenceChains);

  return {
    json,
    markdown,
    summary,
  };
}

function buildJsonReport(summary, analysis, drift, invariants, counterexamples, patches, verification, decision, findingsWithImpact, evidenceChains) {
  return {
    schemaVersion: '1.0.0',
    runId: summary.runId,
    summary,
    analysis: {
      repositoryStats: analysis.repositoryStats,
      entrypoints: analysis.entrypoints,
      routes: analysis.routes,
      environmentVariables: analysis.environmentVariables,
      findings: findingsWithImpact,
    },
    evidenceChains,
    drift: {
      stats: drift.stats,
      findings: drift.findings,
    },
    invariants: {
      summary: invariants.summary,
      invariants: invariants.invariants,
    },
    counterexamples: {
      summary: counterexamples.summary,
      items: counterexamples.counterexamples.map(cx => ({
        ...cx,
        testCode: cx.testCode,
      })),
    },
    patches: {
      summary: patches.summary,
      items: patches.patches.map(p => ({
        id: p.id,
        targetFile: p.targetFile,
        strategy: p.strategy,
        description: p.description,
        diff: p.diff,
        confidence: p.confidence,
      })),
    },
    verification: {
      status: verification.status,
      gateDecision: summary.verificationGate,
      checks: verification.checks,
      durationMs: verification.durationMs,
    },
    decision,
    limitations: [
      'Static Analysis Scope: Call-graph and blast radius analysis are computed using static ES/CJS module imports and Express route mount patterns. Dynamic runtime imports cannot be statically determined.',
      'In-Memory RAM Operation: Patches and invariant verifications occur in browser memory and do not write to the physical filesystem unless diffs are exported.',
      'Engine Boundaries: MSE enforces deterministic checks against supported invariants and does not claim mathematical completeness.'
    ],
  };
}

function buildMarkdownReport(summary, allFindings, invariants, counterexamples, patches, verification, decision, evidenceChains) {
  const lines = [];

  lines.push(`# MSE Analysis Report: ${summary.repositoryName}`);
  lines.push(`**Run ID:** \`${summary.runId}\` | **Generated:** ${summary.analyzedAt}`);
  lines.push(`**Repository Source:** ${summary.repositorySource} | **Verification Gate:** **${summary.verificationGate}**`);
  lines.push(`**Decision:** ${decision.status} — ${decision.reason}`);
  lines.push('');

  // Executive Summary Table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Run ID | \`${summary.runId}\` |`);
  lines.push(`| Files analyzed | ${summary.filesAnalyzed} |`);
  lines.push(`| Source files | ${summary.sourceFilesAnalyzed} |`);
  lines.push(`| Total lines | ${summary.totalLines.toLocaleString()} |`);
  lines.push(`| Routes discovered | ${summary.routesDiscovered} |`);
  lines.push(`| Total findings | ${summary.totalFindings} |`);
  lines.push(`| Critical findings | ${summary.criticalFindings} |`);
  lines.push(`| Counterexamples | ${summary.counterexamplesGenerated} |`);
  lines.push(`| Patches generated | ${summary.patchesGenerated} |`);
  lines.push(`| Verification Gate | **${summary.verificationGate}** |`);
  lines.push(`| Checks passed | ${summary.checksPassed}/${summary.checksTotal} |`);
  lines.push(`| Analysis duration | ${summary.totalDurationMs}ms |`);
  lines.push('');

  // Findings & Impact Paths
  if (allFindings.length > 0) {
    lines.push('## Findings & Evidence Chains');
    lines.push('');

    for (const finding of allFindings) {
      const icon = finding.severity === 'CRITICAL' ? '🔴' : finding.severity === 'HIGH' ? '🟠' : '🟡';
      lines.push(`### ${icon} ${finding.id}: ${finding.title}`);
      lines.push('');
      lines.push(`- **Severity:** ${finding.severity}`);
      lines.push(`- **Type:** ${finding.type}`);
      lines.push(`- **Confidence:** ${finding.confidence}`);
      lines.push('');
      lines.push(finding.description);
      lines.push('');

      if (finding.sourceEvidence?.length > 0) {
        lines.push('**Source Evidence:**');
        for (const ev of finding.sourceEvidence) {
          lines.push(`- \`${ev.file}${ev.line ? ':' + ev.line : ''}\` — ${ev.context || ev.excerpt}`);
        }
        lines.push('');
      }

      if (finding.documentationEvidence?.length > 0) {
        lines.push('**Documentation Evidence:**');
        for (const ev of finding.documentationEvidence) {
          lines.push(`- \`${ev.file}${ev.line ? ':' + ev.line : ''}\` — ${ev.context || ev.excerpt}`);
        }
        lines.push('');
      }

      // Blast Radius / Impact Path
      if (finding.blastRadius?.isAvailable) {
        lines.push('**Impact / Blast Radius:**');
        if (finding.blastRadius.impactChain.length > 1) {
          lines.push(`- *Propagation Path:* \`${finding.blastRadius.impactChain.join(' → ')}\``);
        }
        lines.push(`- *Connected Callers:* ${finding.blastRadius.dependents.length}`);
        lines.push(`- *Downstream Dependencies:* ${finding.blastRadius.dependencies.length}`);
        lines.push(`- *Affected Tests:* ${finding.blastRadius.affectedTests.join(', ') || 'None'}`);
        lines.push('');
      }
    }
  }

  // Invariants
  lines.push('## Invariants');
  lines.push('');
  lines.push('| ID | Name | Status |');
  lines.push('|----|------|--------|');
  for (const inv of invariants.invariants) {
    const statusIcon = inv.status === 'violated' ? '❌ VIOLATED' : inv.status === 'satisfied' ? '✅ SATISFIED' : '❓ UNKNOWN';
    lines.push(`| ${inv.id} | ${inv.name} | ${statusIcon} |`);
  }
  lines.push('');

  // Patches
  if (patches.patches.length > 0) {
    lines.push('## Candidate Patches');
    lines.push('');

    for (const patch of patches.patches) {
      lines.push(`### ${patch.id}: ${patch.description}`);
      lines.push('');
      lines.push(`- **Strategy:** ${patch.strategy}`);
      lines.push(`- **File:** \`${patch.targetFile}\``);
      lines.push(`- **Confidence:** ${patch.confidence}`);
      lines.push('');
      lines.push('```diff');
      lines.push(patch.diff);
      lines.push('```');
      lines.push('');
    }
  }

  // Verification Gate Checks
  lines.push('## Verification Gate Checks');
  lines.push('');

  lines.push('## Final Decision');
  lines.push('');
  lines.push(`**${decision.status}** — ${decision.reason}`);
  lines.push(`**Confidence:** ${decision.confidence}`);
  lines.push(`**Affected files:** ${decision.affectedFiles.join(', ') || 'None identified from current evidence.'}`);
  lines.push('');

  lines.push('## Evidence Chains');
  lines.push('');
  for (const chain of evidenceChains) {
    lines.push(`- **${chain.finding.id}: ${chain.finding.title}** — ${chain.sourceEvidence.length} source evidence item(s), ${chain.counterexample ? 'counterexample linked' : 'no counterexample linked'}, ${chain.candidatePatch ? 'patch linked' : 'no patch linked'}.`);
  }
  lines.push('');

  lines.push('> MSE does not only generate a change. It builds evidence around the change before accepting it.');
  lines.push('');
  lines.push(`**Decision:** **${summary.verificationGate}** (${summary.checksPassed}/${summary.checksTotal} passed)`);
  lines.push('');
  lines.push('| Check | Status | Detail |');
  lines.push('|-------|--------|--------|');
  for (const check of verification.checks) {
    const icon = check.status === 'passed' ? '✅' : check.status === 'skipped' ? '⏭️' : '❌';
    lines.push(`| ${check.name} | ${icon} ${check.status} | ${check.detail} |`);
  }
  lines.push('');

  lines.push('## Limitations');
  lines.push('');
  lines.push('- **Static Analysis Scope**: Call-graph and blast radius analysis are computed using static ES/CJS module imports and Express route mount patterns. Dynamic runtime imports cannot be statically determined.');
  lines.push('- **In-Memory RAM Operation**: Patches and invariant verifications occur in browser memory and do not write to the physical filesystem unless diffs are exported.');
  lines.push('- **Engine Boundaries**: MSE enforces deterministic checks against supported invariants and does not claim mathematical completeness or zero-day infallibility.');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('*Verified against MSE checks. Analysis is based on static pattern matching and deterministic call-graph propagation.*');

  return lines.join('\n');
}

/**
 * @typedef {{
 *   json: object,
 *   markdown: string,
 *   summary: object,
 * }} ReportResult
 */
