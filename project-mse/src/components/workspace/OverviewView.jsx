import React from 'react';
import { computeCapabilityStatus } from '../../engine/capabilities.js';

export default function OverviewView({
  pipelineResult,
  snapshot,
  status,
  onRunAudit,
  onNavigateTab,
  onSelectFinding,
  findings = [],
  appliedPatchIds = [],
  capabilities = null
}) {
  const safeFindings = Array.isArray(findings) ? findings : [];
  const safePatches = Array.isArray(appliedPatchIds) ? appliedPatchIds : [];

  const analysis = pipelineResult?.analysis;
  const counterexamples = pipelineResult?.counterexamples;
  const patches = pipelineResult?.patches;
  const verification = pipelineResult?.verification;
  const decision = pipelineResult?.decision;

  const totalDuration = pipelineResult?.totalDurationMs ?? 0;
  const totalFindings = safeFindings.length;

  const criticalCount = safeFindings.filter(f => f?.severity === 'CRITICAL' && !f?.isRepaired).length;
  const highCount = safeFindings.filter(f => f?.severity === 'HIGH' && !f?.isRepaired).length;
  const mediumCount = safeFindings.filter(f => f?.severity === 'MEDIUM' && !f?.isRepaired).length;
  const resolvedCount = safeFindings.filter(f => f?.isRepaired).length;

  const securityCount = safeFindings.filter(f => f?.category === 'Security').length;
  const driftCount = safeFindings.filter(f => f?.category === 'Documentation Drift').length;
  const behaviorCount = safeFindings.filter(f => f?.category === 'Behavior').length;

  const totalCounterexamples = counterexamples?.summary?.generated || 0;
  const totalPatches = patches?.summary?.generated || 0;
  const unappliedPatches = (patches?.patches || []).filter(p => !safePatches.includes(p.id)).length;

  const repoName = snapshot?.metadata?.name || 'repository';

  const isConverged = decision?.status === 'VERIFIED' && totalFindings > 0 && resolvedCount === totalFindings;

  const activeCapabilities = capabilities || computeCapabilityStatus({
    session: { status: status === 'running' ? 'ANALYZING' : 'COMPLETE' },
    pipelineResult,
    findings: safeFindings,
    snapshot,
    appliedPatchIds: safePatches
  });

  const findCap = activeCapabilities.find;
  const explainCap = activeCapabilities.explain;
  const repairVerifyCap = activeCapabilities.repairVerify;

  return (
    <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 space-y-6 font-sans text-slate-200 bg-[#090d16]">
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
                {status === 'running' ? 'ANALYZING...' : 'ANALYSIS COMPLETE'}
              </span>

              <h1 className="text-xl font-bold text-white font-mono">{repoName}</h1>
            </div>

            <p className="text-xs text-slate-400">
              {isConverged ? (
                <span className="text-emerald-400 font-medium">All recommended fixes are applied in memory and checks pass.</span>
              ) : (
                <span>
                  Found <strong className="text-white">{totalFindings} issues</strong>,{' '}
                  <strong className="text-white">{totalPatches} possible fixes</strong>, and{' '}
                  <strong className="text-white">{totalCounterexamples} test scenarios</strong> to review.
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigateTab('findings')}
              className="px-4 py-2 rounded-md bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-bold text-xs shadow-sm transition flex items-center space-x-1.5"
            >
              <span>Issues Found ({totalFindings})</span>
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
              <span className="text-[10px] text-slate-500 tracking-wider block">Repository size</span>
            <div className="font-semibold text-white mt-0.5">
              {snapshot?.files?.length || 0} files <span className="text-slate-500 text-[10px]">({analysis?.repositoryStats?.totalLines || 0} lines)</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 tracking-wider block">Analysis time</span>
            <div className="font-semibold text-[#38bdf8] font-mono mt-0.5">
              {totalDuration > 0 ? `${totalDuration}ms` : '--'}
            </div>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 tracking-wider block">Fixes to review</span>
            <div className="font-semibold text-white mt-0.5">
              {unappliedPatches} pending <span className="text-slate-500 text-[10px]">({resolvedCount} applied)</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 tracking-wider block">Check status</span>
            <div className={`font-semibold mt-0.5 ${
              decision?.status === 'VERIFIED' ? 'text-emerald-400' : decision?.status === 'REJECTED' ? 'text-red-400' : 'text-amber-400'
            }`}>
              {decision?.status || 'REVIEW NEEDED'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500" aria-label="Analysis journey">
        <span className="text-slate-300">Choose Repository</span>
        <span>→</span>
        <span className="text-[#38bdf8]">Analyze</span>
        <span>→</span>
        <span className="text-[#38bdf8]">Overview</span>
        <span>→</span>
        <button
          onClick={() => {
            if (findings[0]) onSelectFinding?.(findings[0]);
            onNavigateTab('findings');
          }}
          className="hover:text-white"
        >Review Finding</button>
        <span>→</span>
        <button
          onClick={() => {
            if (findings[0]) onSelectFinding?.(findings[0]);
            onNavigateTab('findings');
          }}
          className="hover:text-white"
        >Evidence</button>
        <span>→</span>
        <button onClick={() => onNavigateTab('changes')} className="hover:text-white">Patch</button>
        <span>→</span>
        <button onClick={() => onNavigateTab('verification')} className="hover:text-white">Verify</button>
        <span>→</span>
        <button onClick={() => onNavigateTab('report')} className="hover:text-white">Report</button>
      </div>

      {/* 2. WHAT MSE DOES: 3 CORE CAPABILITIES */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-[#38bdf8]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              What MSE Does
            </h2>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            Autonomous Verification Loop
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Capability 1: FIND */}
          <div className="bg-[#0d131f] border border-[#263147] hover:border-[#38bdf8]/60 rounded-lg p-5 flex flex-col justify-between space-y-4 transition shadow-sm group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-[#38bdf8] bg-[#38bdf8]/10 border border-[#38bdf8]/30 px-2 py-0.5 rounded">
                  1. {findCap.title}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  findCap.totalFindings > 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {findCap.badge}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-[#38bdf8] transition">
                  {findCap.headline}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {findCap.description}
                </p>
              </div>

              {/* Real Engine Underlying Metrics */}
              <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1.5 text-xs font-mono">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Total Findings:</span>
                  <span className="font-bold text-white">{findCap.totalFindings}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Critical Risks:</span>
                  <span className="font-bold text-red-400">{findCap.criticalCount}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Security &amp; Drift:</span>
                  <span className="text-[#38bdf8]">{findCap.securityCount} sec / {findCap.driftCount} drift</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#1e293b] flex flex-wrap items-center gap-2">
              <button
                onClick={() => onNavigateTab('findings')}
                className="w-full py-2 px-3 rounded bg-[#162032] hover:bg-[#38bdf8] hover:text-[#090d16] border border-[#263147] text-slate-200 text-xs font-bold transition flex items-center justify-between"
              >
                <span>Explore Findings ({findCap.totalFindings})</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>

          {/* Capability 2: EXPLAIN */}
          <div className="bg-[#0d131f] border border-[#263147] hover:border-amber-400/60 rounded-lg p-5 flex flex-col justify-between space-y-4 transition shadow-sm group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded">
                  2. {explainCap.title}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {explainCap.badge}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition">
                  {explainCap.headline}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {explainCap.description}
                </p>
              </div>

              {/* Real Engine Underlying Metrics */}
              <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1.5 text-xs font-mono">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Traced to Code:</span>
                  <span className="font-bold text-white">{explainCap.tracedFindingsCount} / {findCap.totalFindings}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Counterexamples:</span>
                  <span className="font-bold text-amber-400">{explainCap.counterexamplesCount} scenarios</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Blast Radius Graphs:</span>
                  <span className="text-white">{explainCap.blastRadiusCount} affected paths</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#1e293b] flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  if (safeFindings[0]) onSelectFinding?.(safeFindings[0]);
                  onNavigateTab('findings');
                }}
                className="w-full py-2 px-3 rounded bg-[#162032] hover:bg-amber-400 hover:text-[#090d16] border border-[#263147] text-slate-200 text-xs font-bold transition flex items-center justify-between"
              >
                <span>Inspect Evidence Chain</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>

          {/* Capability 3: REPAIR & VERIFY */}
          <div className="bg-[#0d131f] border border-[#263147] hover:border-emerald-400/60 rounded-lg p-5 flex flex-col justify-between space-y-4 transition shadow-sm group">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 px-2 py-0.5 rounded">
                  3. {repairVerifyCap.title}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  repairVerifyCap.isVerified
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-blue-500/20 text-[#38bdf8] border border-blue-500/30'
                }`}>
                  {repairVerifyCap.badge}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition">
                  {repairVerifyCap.headline}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {repairVerifyCap.description}
                </p>
              </div>

              {/* Real Engine Underlying Metrics */}
              <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1.5 text-xs font-mono">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Synthesized Patches:</span>
                  <span className="font-bold text-white">{repairVerifyCap.candidatePatchesCount} in RAM</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">In-RAM Edits:</span>
                  <span className="font-bold text-purple-400">{repairVerifyCap.totalModifications} active</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Verification Gate:</span>
                  <span className={repairVerifyCap.isVerified ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {repairVerifyCap.verificationGateStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#1e293b] flex items-center space-x-2">
              <button
                onClick={() => onNavigateTab('source')}
                className="flex-1 py-2 px-2.5 rounded bg-[#162032] hover:bg-emerald-500 hover:text-[#090d16] border border-[#263147] text-slate-200 text-xs font-bold transition text-center"
              >
                Edit Source
              </button>
              <button
                onClick={() => onNavigateTab('changes')}
                className="flex-1 py-2 px-2.5 rounded bg-[#162032] hover:bg-[#38bdf8] hover:text-[#090d16] border border-[#263147] text-slate-200 text-xs font-bold transition text-center"
              >
                View Changes
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. VERIFICATION GATE OUTCOME */}
      <div className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3.5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Change Verification
            </h2>
          </div>
          <span className={`text-xs px-2.5 py-0.5 rounded font-bold font-mono ${
            decision?.status === 'VERIFIED'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {decision?.status || 'REVIEW NEEDED'}
          </span>
        </div>

        <div className="p-3.5 bg-[#111724] border border-[#1e293b] rounded space-y-2.5 text-xs">
          <p className="text-slate-300">
            {decision?.status === 'VERIFIED'
              ? 'All checks passed for this analysis.'
              : `${unappliedPatches} fixes are available to review.`}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-[#1e293b] text-[11px]">
            {(decision?.checks || verification?.checks || []).map((check, index) => {
              const checkStatus = String(check.status || 'skipped').toUpperCase();
              const passed = check.status === 'passed';
              const skipped = check.status === 'skipped';
              return (
                <div key={index} className="flex items-center space-x-1.5">
                  <span className={passed ? 'text-emerald-400 font-bold' : skipped ? 'text-slate-500' : 'text-red-400 font-bold'}>
                    {passed ? '✓' : skipped ? '○' : '✗'}
                  </span>
                  <span className="text-slate-300">{check.name}: {checkStatus}</span>
                </div>
              );
            })}
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
              onClick={() => onNavigateTab('verification')}
              className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-emerald-500/30 text-emerald-300 text-xs font-medium transition"
            >
              Verify Change
            </button>
            <button
              onClick={() => onNavigateTab('source')}
              className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs font-medium transition"
            >
              Inspect Code
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
              <span className="font-bold text-white group-hover:text-[#38bdf8]">1. Issues Found</span>
              <span className="text-slate-500 font-mono text-[10px]">Step 1</span>
            </div>
              <p className="text-xs text-slate-400">
                Inspect detected issues with explanations and supporting evidence.
            </p>
          </div>

          <div 
            onClick={() => onNavigateTab('changes')}
            className="p-4 rounded-lg bg-[#0d131f] border border-[#263147] hover:border-emerald-500/60 cursor-pointer transition space-y-2 group"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white group-hover:text-emerald-400">2. Review Fix</span>
              <span className="text-slate-500 font-mono text-[10px]">Step 2</span>
            </div>
            <p className="text-xs text-slate-400">
              Preview unified diffs for synthesized patches and apply them directly into ephemeral memory.
            </p>
          </div>

          <div 
            onClick={() => onNavigateTab('verification')}
            className="p-4 rounded-lg bg-[#0d131f] border border-[#263147] hover:border-slate-400 cursor-pointer transition space-y-2 group"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white group-hover:text-slate-200">3. Verify Change</span>
              <span className="text-slate-500 font-mono text-[10px]">Step 3</span>
            </div>
            <p className="text-xs text-slate-400">
              Confirm the checks after reviewing and applying a fix.
            </p>
          </div>
        </div>
      </div>

      {/* High-Priority Findings Preview */}
      {safeFindings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Top Priority Findings
            </h2>
            <button
              onClick={() => onNavigateTab('findings')}
              className="text-xs text-[#38bdf8] hover:underline"
            >
              View all {safeFindings.length} findings &rarr;
            </button>
          </div>

          <div className="space-y-2">
            {safeFindings.slice(0, 3).map((finding) => (
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
