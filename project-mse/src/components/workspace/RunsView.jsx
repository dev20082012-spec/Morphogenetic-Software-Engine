import React, { useState } from 'react';
import { getAnalysisRuns, clearAnalysisRuns } from '../../utils/sessionManager.js';

export default function RunsView({
  onSelectRun,
  currentRunId
}) {
  const [runs, setRuns] = useState(() => getAnalysisRuns());

  const handleClear = () => {
    clearAnalysisRuns();
    setRuns([]);
  };

  return (
    <div className="flex-1 flex flex-col font-sans bg-[#090d16] text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#263147] bg-[#0d131f] flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-bold text-white">Analysis Sessions &amp; Runs</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Local product memory of recent repository audits and verification outcomes.
          </p>
        </div>

        {runs.length > 0 && (
          <button
            onClick={handleClear}
            className="px-2.5 py-1 rounded bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-400 hover:text-white text-xs transition"
          >
            Clear History
          </button>
        )}
      </div>

      {/* Runs List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {runs.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-500">
            <span className="text-xl">⏱</span>
            <p className="text-xs">No saved runs yet. Execute an audit to record an analysis session.</p>
          </div>
        ) : (
          runs.map((run) => {
            const isCurrent = currentRunId === run.id;
            const timeAgo = new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={run.id}
                onClick={() => onSelectRun(run)}
                className={`bg-[#0d131f] border rounded-lg p-4 cursor-pointer transition space-y-3 shadow-sm group ${
                  isCurrent
                    ? 'border-[#38bdf8] bg-[#162032]'
                    : 'border-[#263147] hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="font-mono font-bold text-xs text-[#38bdf8] bg-[#111724] px-2 py-0.5 rounded border border-[#263147]">
                      {run.id}
                    </span>
                    <h3 className="text-sm font-bold text-white group-hover:text-[#38bdf8] transition font-mono">
                      {run.repositoryName}
                    </h3>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 px-1.5 py-0.2 rounded bg-[#111724] border border-[#1e293b]">
                      {run.repositorySource}
                    </span>
                  </div>

                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                    run.verificationOutcome === 'VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : run.verificationOutcome === 'REJECTED'
                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                        : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {run.verificationOutcome}
                  </span>
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 text-xs pt-1 font-mono text-slate-400">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Duration</span>
                    <span className="text-white font-semibold">{run.durationMs}ms</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Files</span>
                    <span className="text-white font-semibold">{run.filesCount}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Findings</span>
                    <span className={run.findingsCount > 0 ? 'text-amber-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                      {run.findingsCount}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Violations</span>
                    <span className="text-red-300 font-semibold">{run.invariantViolations ?? 0}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Counterexamples</span>
                    <span className="text-white font-semibold">{run.counterexamplesCount ?? 0}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Patches</span>
                    <span className="text-white font-semibold">{run.patchesCount}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block uppercase">Time</span>
                    <span className="text-slate-400">{timeAgo}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1e293b] flex items-center justify-between text-xs">
                  <span className="text-slate-500 text-[11px]">
                    Click to restore snapshot &amp; inspection state
                  </span>
                  <span className="text-xs font-semibold text-[#38bdf8] group-hover:translate-x-0.5 transition">
                    Open Run &rarr;
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
