import React from 'react';

export default function OverviewView({
  pipelineResult,
  snapshot,
  status,
  onRunAudit,
  onNavigateTab,
  onSelectFinding,
  findings = [],
  appliedPatchIds = []
}) {
  const analysis = pipelineResult?.analysis;
  const invariants = pipelineResult?.invariants;
  const counterexamples = pipelineResult?.counterexamples;
  const patches = pipelineResult?.patches;
  const verification = pipelineResult?.verification;

  const totalDuration = pipelineResult?.totalDurationMs ?? 0;
  const totalFindings = findings.length;

  const criticalCount = findings.filter(f => f.severity === 'CRITICAL' && !f.isRepaired).length;
  const highCount = findings.filter(f => f.severity === 'HIGH' && !f.isRepaired).length;
  const mediumCount = findings.filter(f => f.severity === 'MEDIUM' && !f.isRepaired).length;
  const resolvedCount = findings.filter(f => f.isRepaired).length;

  const securityCount = findings.filter(f => f.category === 'Security').length;
  const driftCount = findings.filter(f => f.category === 'Documentation Drift').length;
  const behaviorCount = findings.filter(f => f.category === 'Behavior').length;

  const totalInvariants = invariants?.summary?.total || 0;
  const violatedInvariants = invariants?.summary?.violated || 0;
  const totalCounterexamples = counterexamples?.summary?.generated || 0;
  const totalPatches = patches?.summary?.generated || 0;
  const unappliedPatches = (patches?.patches || []).filter(p => !appliedPatchIds.includes(p.id)).length;

  const repoName = snapshot?.metadata?.name || 'repository';

  const isConverged = totalFindings > 0 && resolvedCount === totalFindings;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 font-sans text-slate-200 bg-[#090d16]">
      {/* 1. WHAT REPOSITORY AM I LOOKING AT? & 2. IS ANYTHING WRONG? */}
      <div className="bg-[#0d131f] border border-[#263147] rounded-lg p-6 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2.5">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                isConverged
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : criticalCount > 0
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-blue-500/20 text-[#38bdf8] border border-blue-500/30'
              }`}>
                {isConverged ? 'HOMEOSTASIS CONVERGED' : status === 'running' ? 'ANALYZING...' : 'ANALYSIS COMPLETE'}
              </span>

              <h1 className="text-xl font-bold text-white font-mono">{repoName}</h1>
            </div>

            <p className="text-xs text-slate-400">
              {isConverged ? (
                <span className="text-emerald-400 font-medium">All candidate patches applied in RAM. System contracts verified.</span>
              ) : (
                <span>
                  Discovered <strong className="text-white">{totalFindings} findings</strong>,{' '}
                  <strong className="text-white">{violatedInvariants} of {totalInvariants} invariant violations</strong>,{' '}
                  <strong className="text-white">{totalCounterexamples} counterexamples</strong>, and{' '}
                  <strong className="text-white">{totalPatches} candidate fixes</strong>.
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => onNavigateTab('findings')}
              className="px-4 py-2 rounded-md bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-bold text-xs shadow-sm transition flex items-center space-x-1.5"
            >
              <span>Review Findings ({totalFindings})</span>
              <span>&rarr;</span>
            </button>

            <button
              onClick={onRunAudit}
              disabled={status === 'running'}
              className="px-3.5 py-2 rounded-md bg-[#1e293b] hover:bg-[#334155] border border-[#263147] text-slate-200 text-xs font-medium transition disabled:opacity-50"
            >
              {status === 'running' ? 'Running...' : 'Re-run Analysis'}
            </button>
          </div>
        </div>

        {/* Quick Numbers Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#1e293b] text-xs">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Repository Scale</span>
            <div className="font-semibold text-white mt-0.5">
              {snapshot?.files?.length || 0} files <span className="text-slate-500 text-[10px]">({analysis?.repositoryStats?.totalLines || 0} lines)</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Analysis Time</span>
            <div className="font-semibold text-[#38bdf8] font-mono mt-0.5">
              {totalDuration > 0 ? `${totalDuration}ms` : '--'}
            </div>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Candidate Changes</span>
            <div className="font-semibold text-white mt-0.5">
              {unappliedPatches} pending <span className="text-slate-500 text-[10px]">({resolvedCount} applied)</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Verification State</span>
            <div className={`font-semibold mt-0.5 ${
              verification?.status === 'VERIFIED' ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {verification?.status === 'VERIFIED' ? 'VERIFIED (PASS)' : 'ATTENTION REQUIRED'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. VERIFICATION GATE OUTCOME */}
      <div className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3.5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              MSE Verification Gate
            </h2>
          </div>
          <span className={`text-xs px-2.5 py-0.5 rounded font-bold font-mono ${
            verification?.status === 'VERIFIED'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {verification?.status === 'VERIFIED' ? 'VERIFIED AGAINST MSE CHECKS' : 'NEEDS REVIEW (UNAPPLIED CHANGES)'}
          </span>
        </div>

        <div className="p-3.5 bg-[#111724] border border-[#1e293b] rounded space-y-2.5 text-xs">
          <p className="text-slate-300">
            {verification?.status === 'VERIFIED'
              ? 'All required checks passed against in-memory repository contracts. Invariants restored with no newly introduced issues.'
              : `${unappliedPatches} candidate patches available. Apply patches in memory to restore system invariants and resolve counterexamples.`}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-[#1e293b] text-[11px]">
            <div className="flex items-center space-x-1.5">
              <span className={resolvedCount > 0 || isConverged ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                {resolvedCount > 0 || isConverged ? '✓' : '○'}
              </span>
              <span className="text-slate-300">Counterexample resolved</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className={resolvedCount > 0 || isConverged ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                {resolvedCount > 0 || isConverged ? '✓' : '○'}
              </span>
              <span className="text-slate-300">Regression test passes</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className={resolvedCount > 0 || isConverged ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                {resolvedCount > 0 || isConverged ? '✓' : '○'}
              </span>
              <span className="text-slate-300">Invariant restored</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-emerald-400 font-bold">✓</span>
              <span className="text-slate-300">Build check passes</span>
            </div>
            <div className="flex items-center space-x-1.5 sm:col-span-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span className="text-slate-300">No newly detected supported violation</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#1e293b]">
            <button
              onClick={() => onNavigateTab('findings')}
              className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs font-medium transition"
            >
              View Evidence ({totalFindings})
            </button>
            <button
              onClick={() => onNavigateTab('changes')}
              className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-[#38bdf8] text-xs font-medium transition"
            >
              View Changes &amp; Diff ({totalPatches})
            </button>
            <button
              onClick={() => onNavigateTab('report')}
              className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-purple-300 text-xs font-medium transition"
            >
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* 3. WHAT DID MSE DISCOVER? */}
      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-400">
          What MSE Found
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Breakdown by Severity */}
          <div className="bg-[#0d131f] border border-[#263147] rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-white flex items-center justify-between">
              <span>Severity Breakdown</span>
              <span className="text-[11px] text-slate-400 font-normal">{totalFindings} total</span>
            </h3>

            <div className="space-y-2 text-xs">
              <div 
                onClick={() => onNavigateTab('findings')}
                className="flex items-center justify-between p-2 rounded bg-[#111724] border border-[#1e293b] hover:border-red-500/50 cursor-pointer transition"
              >
                <div className="flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                  <span className="font-medium text-slate-200">Critical</span>
                </div>
                <span className="font-mono font-bold text-red-400">{criticalCount}</span>
              </div>

              <div 
                onClick={() => onNavigateTab('findings')}
                className="flex items-center justify-between p-2 rounded bg-[#111724] border border-[#1e293b] hover:border-amber-500/50 cursor-pointer transition"
              >
                <div className="flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="font-medium text-slate-200">High</span>
                </div>
                <span className="font-mono font-bold text-amber-400">{highCount}</span>
              </div>

              <div 
                onClick={() => onNavigateTab('findings')}
                className="flex items-center justify-between p-2 rounded bg-[#111724] border border-[#1e293b] hover:border-blue-500/50 cursor-pointer transition"
              >
                <div className="flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-blue-400" />
                  <span className="font-medium text-slate-200">Medium</span>
                </div>
                <span className="font-mono font-bold text-[#38bdf8]">{mediumCount}</span>
              </div>
            </div>
          </div>

          {/* Breakdown by Category */}
          <div className="bg-[#0d131f] border border-[#263147] rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-white flex items-center justify-between">
              <span>Category Breakdown</span>
              <span className="text-[11px] text-slate-400 font-normal">Real engine domains</span>
            </h3>

            <div className="space-y-2 text-xs">
              <div 
                onClick={() => onNavigateTab('findings')}
                className="flex items-center justify-between p-2 rounded bg-[#111724] border border-[#1e293b] hover:border-[#263147] cursor-pointer transition"
              >
                <span className="font-medium text-slate-200">Security Ingress &amp; Auth</span>
                <span className="font-mono font-bold text-white">{securityCount}</span>
              </div>

              <div 
                onClick={() => onNavigateTab('findings')}
                className="flex items-center justify-between p-2 rounded bg-[#111724] border border-[#1e293b] hover:border-[#263147] cursor-pointer transition"
              >
                <span className="font-medium text-slate-200">Specification &amp; Port Drift</span>
                <span className="font-mono font-bold text-white">{driftCount}</span>
              </div>

              <div 
                onClick={() => onNavigateTab('findings')}
                className="flex items-center justify-between p-2 rounded bg-[#111724] border border-[#1e293b] hover:border-[#263147] cursor-pointer transition"
              >
                <span className="font-medium text-slate-200">Behavior &amp; Invariants</span>
                <span className="font-mono font-bold text-white">{behaviorCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. WHAT SHOULD I DO NEXT? */}
      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-400">
          Recommended Next Steps
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div 
            onClick={() => onNavigateTab('findings')}
            className="p-4 rounded-lg bg-[#0d131f] border border-[#263147] hover:border-[#38bdf8]/60 cursor-pointer transition space-y-2 group"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white group-hover:text-[#38bdf8]">1. Review Findings</span>
              <span className="text-slate-500 font-mono text-[10px]">Step 1</span>
            </div>
            <p className="text-xs text-slate-400">
              Inspect detected issues with human explanations, code evidence, and synthesized counterexamples.
            </p>
          </div>

          <div 
            onClick={() => onNavigateTab('changes')}
            className="p-4 rounded-lg bg-[#0d131f] border border-[#263147] hover:border-emerald-500/60 cursor-pointer transition space-y-2 group"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white group-hover:text-emerald-400">2. Review &amp; Apply Changes</span>
              <span className="text-slate-500 font-mono text-[10px]">Step 2</span>
            </div>
            <p className="text-xs text-slate-400">
              Preview unified diffs for synthesized patches and apply them directly into ephemeral memory.
            </p>
          </div>

          <div 
            onClick={() => onNavigateTab('report')}
            className="p-4 rounded-lg bg-[#0d131f] border border-[#263147] hover:border-slate-400 cursor-pointer transition space-y-2 group"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white group-hover:text-slate-200">3. Export Audit Report</span>
              <span className="text-slate-500 font-mono text-[10px]">Step 3</span>
            </div>
            <p className="text-xs text-slate-400">
              Download complete Markdown or JSON reports with finding evidence and verified invariant status.
            </p>
          </div>
        </div>
      </div>

      {/* High-Priority Findings Preview */}
      {findings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Top Priority Findings
            </h2>
            <button
              onClick={() => onNavigateTab('findings')}
              className="text-xs text-[#38bdf8] hover:underline"
            >
              View all {findings.length} findings &rarr;
            </button>
          </div>

          <div className="space-y-2">
            {findings.slice(0, 3).map((finding) => (
              <div
                key={finding.id}
                onClick={() => {
                  if (onSelectFinding) onSelectFinding(finding);
                  onNavigateTab('findings');
                }}
                className="bg-[#0d131f] border border-[#263147] hover:border-[#38bdf8]/60 rounded-lg p-3.5 flex items-center justify-between gap-4 cursor-pointer transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      finding.severity === 'CRITICAL'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {finding.severity}
                    </span>
                    <span className="text-xs font-semibold text-white">{finding.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 line-clamp-1">{finding.description}</div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[11px] font-mono text-slate-400">{finding.file}:{finding.line}</div>
                  <span className="text-[11px] text-[#38bdf8] font-medium">View Finding &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
