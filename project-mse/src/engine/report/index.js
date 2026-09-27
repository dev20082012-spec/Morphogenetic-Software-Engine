/**
 * Report Generator
 *
 * Generates structured JSON and human-readable Markdown reports
 * from the full pipeline results.
 */

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
 * @param {number} params.totalDurationMs
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
  totalDurationMs,
}) {
  const allFindings = [...analysis.findings, ...drift.findings];
  const criticalFindings = allFindings.filter(f => f.severity === 'CRITICAL');

  const summary = {
    repositoryName: snapshot.metadata.name,
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
    verificationStatus: verification.status,
    checksPassed: verification.checks.filter(c => c.status === 'passed').length,
    checksTotal: verification.checks.length,
    totalDurationMs,
  };

  const json = buildJsonReport(summary, analysis, drift, invariants, counterexamples, patches, verification);
  const markdown = buildMarkdownReport(summary, allFindings, invariants, counterexamples, patches, verification);

  return {
    json,
    markdown,
    summary,
  };
}

function buildJsonReport(summary, analysis, drift, invariants, counterexamples, patches, verification) {
  return {
    schemaVersion: '1.0.0',
    summary,
    analysis: {
      repositoryStats: analysis.repositoryStats,
      entrypoints: analysis.entrypoints,
      routes: analysis.routes,
      environmentVariables: analysis.environmentVariables,
      findings: analysis.findings,
    },
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
        testCode: cx.testCode, // Include full test code
      })),
    },
    patches: {
      summary: patches.summary,
      items: patches.patches.map(p => ({
        id: p.id,
        findingId: p.findingId,
        targetFile: p.targetFile,
        strategy: p.strategy,
        description: p.description,
        diff: p.diff,
        filesChanged: p.filesChanged,
        confidence: p.confidence,
      })),
    },
    verification: {
      status: verification.status,
      checks: verification.checks,
      evidence: verification.evidence,
      durationMs: verification.durationMs,
    },
  };
}

function buildMarkdownReport(summary, allFindings, invariants, counterexamples, patches, verification) {
  const lines = [];

  lines.push(`# MSE Analysis Report: ${summary.repositoryName}`);
  lines.push('');
  lines.push(`> Generated at ${summary.analyzedAt} by Morphogenetic Software Engine`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Files analyzed | ${summary.filesAnalyzed} |`);
  lines.push(`| Source files | ${summary.sourceFilesAnalyzed} |`);
  lines.push(`| Total lines | ${summary.totalLines.toLocaleString()} |`);
  lines.push(`| Routes discovered | ${summary.routesDiscovered} |`);
  lines.push(`| Dependencies discovered | ${summary.dependenciesDiscovered} |`);
  lines.push(`| Environment variables | ${summary.environmentVariables} |`);
  lines.push(`| Total findings | ${summary.totalFindings} |`);
  lines.push(`| Critical findings | ${summary.criticalFindings} |`);
  lines.push(`| Patches generated | ${summary.patchesGenerated} |`);
  lines.push(`| Verification | ${summary.verificationStatus} |`);
  lines.push(`| Checks passed | ${summary.checksPassed}/${summary.checksTotal} |`);
  lines.push(`| Analysis duration | ${summary.totalDurationMs}ms |`);
  lines.push('');

  // Findings
  if (allFindings.length > 0) {
    lines.push('## Findings');
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

      if (finding.sourceEvidence.length > 0) {
        lines.push('**Source Evidence:**');
        for (const ev of finding.sourceEvidence) {
          lines.push(`- \`${ev.file}${ev.line ? ':' + ev.line : ''}\` — ${ev.context || ev.excerpt}`);
        }
        lines.push('');
      }

      if (finding.documentationEvidence.length > 0) {
        lines.push('**Documentation Evidence:**');
        for (const ev of finding.documentationEvidence) {
          lines.push(`- \`${ev.file}${ev.line ? ':' + ev.line : ''}\` — ${ev.context || ev.excerpt}`);
        }
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
    lines.push('## Patches');
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

  // Verification
  lines.push('## Verification');
  lines.push('');
  lines.push(`**Status:** ${verification.status}`);
  lines.push('');
  lines.push('| Check | Status | Detail |');
  lines.push('|-------|--------|--------|');
  for (const check of verification.checks) {
    const icon = check.status === 'passed' ? '✅' : '❌';
    lines.push(`| ${check.name} | ${icon} ${check.status} | ${check.detail} |`);
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('*Verified against MSE checks. Analysis is based on static pattern matching and may not capture all runtime behaviors.*');

  return lines.join('\n');
}

/**
 * @typedef {{
 *   json: object,
 *   markdown: string,
 *   summary: object,
 * }} ReportResult
 */
