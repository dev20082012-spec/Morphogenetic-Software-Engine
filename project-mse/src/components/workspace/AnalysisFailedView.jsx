import React from 'react';

/**
 * AnalysisFailedView
 *
 * Clean failure display shown when repository analysis or ingestion encounters an error.
 * Guaranteed not to leave partially rendered results underneath.
 */
export default function AnalysisFailedView({
  error,
  repositoryName = 'repository',
  onRetry,
  onChangeRepository
}) {
  const errorMessage = typeof error === 'string'
    ? error
    : error?.message || 'An unexpected failure occurred during analysis.';

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#090d16] font-sans text-slate-200 select-none overflow-y-auto">
      <div className="max-w-md w-full bg-[#111724] border border-red-500/40 rounded-xl p-6 shadow-2xl space-y-5 text-center">
        
        {/* Error Icon */}
        <div className="h-12 w-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400 text-xl font-bold font-mono">
          ✕
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white tracking-wide uppercase font-mono">
            ANALYSIS FAILED
          </h2>
          <p className="text-xs text-slate-400">
            Repository <span className="font-mono text-slate-200">{repositoryName}</span> could not be processed.
          </p>
        </div>

        {/* Reason Box */}
        <div className="bg-[#090d16] border border-[#263147] rounded-lg p-3.5 text-left font-mono text-xs text-red-300 max-h-36 overflow-y-auto break-words">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
            Failure Reason:
          </span>
          {errorMessage}
        </div>

        {/* Action Controls: [ Try Again ] [ Change Repository ] */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={onRetry || (() => {})}
            className="px-4 py-2 rounded-md bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-bold text-xs shadow-md transition"
          >
            Try Again
          </button>

          <button
            onClick={onChangeRepository}
            className="px-4 py-2 rounded-md bg-[#1e293b] hover:bg-[#334155] border border-[#263147] text-slate-200 font-medium text-xs transition"
          >
            Change Repository
          </button>
        </div>

      </div>
    </div>
  );
}
