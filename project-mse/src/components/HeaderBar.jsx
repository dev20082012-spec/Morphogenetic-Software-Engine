import React from 'react';

export default function HeaderBar({
  repositoryName,
  repositorySource,
  status,
  onRunAudit,
  durationMs,
  findingsCount = 0,
  hasPatches = false,
  allPatchesApplied = false,
  onApplyAllPatches,
  onChangeRepository,
  onToggleTechnical,
  isTechnicalOpen = false
}) {
  const isRunning = status === 'running';

  return (
    <header className="border-b border-[#263147] bg-[#0d131f] px-4 py-2.5 flex items-center justify-between shrink-0 select-none font-sans">
      {/* Left: Brand & Repository Context */}
      <div className="flex items-center space-x-3">
        <div 
          onClick={onChangeRepository}
          className="flex items-center space-x-2 cursor-pointer group"
          title="Return to Home / Select Repository"
        >
          <div className="h-6 w-6 rounded bg-[#1e293b] border border-[#334155] flex items-center justify-center font-mono font-bold text-xs text-[#38bdf8] group-hover:border-[#38bdf8] transition">
            M
          </div>
          <span className="text-xs font-bold text-white group-hover:text-[#38bdf8] transition font-mono">
            PROJECT MSE
          </span>
        </div>

        <span className="text-slate-600">/</span>

        {/* Current Repository Chip */}
        <div className="flex items-center space-x-2 bg-[#111724] border border-[#263147] px-2.5 py-1 rounded text-xs">
          <span className="font-semibold text-slate-200 font-mono">{repositoryName || 'repository'}</span>
          <span className="text-[10px] text-slate-400 font-medium px-1 rounded bg-[#162032] border border-[#24334d]">
            {repositorySource === 'zip' ? 'ZIP' : 'DEMO'}
          </span>
          <button
            onClick={onChangeRepository}
            className="text-[11px] text-[#38bdf8] hover:underline pl-1"
          >
            Switch
          </button>
        </div>
      </div>

      {/* Right: Telemetry, Primary Actions & Technical Analysis Toggle */}
      <div className="flex items-center space-x-2.5 text-xs">
        {/* Execution Duration Pill */}
        <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#111724] border border-[#263147] text-slate-400 font-mono text-[11px]">
          <span>Duration:</span>
          <span className="text-[#38bdf8] font-bold">{durationMs > 0 ? `${durationMs}ms` : '--'}</span>
        </div>

        {/* Findings Count Pill */}
        {findingsCount > 0 && (
          <div className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded bg-[#111724] border border-[#263147] text-[11px] font-mono">
            <span className="text-slate-400">Findings:</span>
            <span className="text-red-400 font-bold">{findingsCount}</span>
          </div>
        )}

        {/* Apply All Patches Quick Action if available */}
        {hasPatches && !allPatchesApplied && (
          <button
            onClick={onApplyAllPatches}
            disabled={isRunning}
            className="hidden md:flex px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs transition items-center space-x-1 shadow-sm"
          >
            <span>Apply All Fixes</span>
          </button>
        )}

        {/* Primary Run Audit Button */}
        <button
          onClick={onRunAudit}
          disabled={isRunning}
          className="px-3.5 py-1.5 rounded bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-bold text-xs shadow-sm transition flex items-center space-x-1.5 disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <span className="h-2 w-2 rounded-full bg-[#090d16] animate-ping" />
              <span>Analyzing...</span>
            </>
          ) : (
            <span>Run Analysis</span>
          )}
        </button>

        {/* Technical Drawer Toggle */}
        <button
          onClick={onToggleTechnical}
          className={`px-2.5 py-1.5 rounded border transition flex items-center space-x-1.5 text-xs font-mono ${
            isTechnicalOpen
              ? 'bg-[#162032] border-[#38bdf8] text-[#38bdf8]'
              : 'bg-[#111724] border-[#263147] text-slate-300 hover:text-white'
          }`}
          title="Toggle Progressive Disclosure of AST & Prover Internals"
        >
          <span>[&lt;/&gt;]</span>
          <span className="hidden lg:inline">Technical Analysis</span>
        </button>
      </div>
    </header>
  );
}
