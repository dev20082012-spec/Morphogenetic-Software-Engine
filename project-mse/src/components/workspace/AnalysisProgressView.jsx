import React from 'react';

/**
 * AnalysisProgressView
 *
 * Displays atomic repository analysis progress derived strictly
 * from real pipeline events. No fake setTimeout states.
 *
 * Stages:
 * 1. Understanding repository
 * 2. Checking specifications
 * 3. Finding risky behavior
 * 4. Building evidence
 * 5. Preparing repairs
 * 6. Verifying results
 */

const STAGES = [
  { id: 'understanding', label: 'Understanding repository' },
  { id: 'specifications', label: 'Checking specifications' },
  { id: 'riskyBehavior', label: 'Finding risky behavior' },
  { id: 'evidence', label: 'Building evidence' },
  { id: 'repairs', label: 'Preparing repairs' },
  { id: 'verifying', label: 'Verifying results' },
];

export default function AnalysisProgressView({ session, logs = [] }) {
  const repositoryName = session?.repository || 'repository';
  const source = session?.source || 'demo';
  const sourceLabel = source === 'github' ? 'GITHUB' : source === 'zip' ? 'ZIP' : 'DEMO';
  const progress = session?.progress || {};
  const stages = progress.stages || {};
  const currentDetail = progress.detail || (logs.length > 0 ? logs[logs.length - 1] : 'Initializing ephemeral RAM session...');

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#090d16] font-sans text-slate-200 select-none overflow-y-auto">
      <div className="max-w-md w-full bg-[#0d131f] border border-[#263147] rounded-xl p-6 shadow-2xl space-y-6">
        
        {/* Header & Target Repository */}
        <div className="border-b border-[#1e293b] pb-4 flex items-center justify-between">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-[#38bdf8] animate-ping" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#38bdf8] font-bold">
                ANALYSIS IN PROGRESS
              </span>
            </div>
            <h2 className="text-base font-bold text-white font-mono truncate" title={repositoryName}>
              {repositoryName}
            </h2>
          </div>

          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#111724] border border-[#263147] text-slate-400 font-semibold shrink-0">
            {sourceLabel}
          </span>
        </div>

        {/* The 6 Atomic Pipeline Stages */}
        <div className="space-y-3.5 py-1">
          {STAGES.map((stage) => {
            const status = stages[stage.id] || 'pending'; // 'pending' | 'running' | 'completed' | 'failed'

            return (
              <div
                key={stage.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition ${
                  status === 'running'
                    ? 'bg-[#111c2e] border-[#38bdf8]/40 shadow-sm'
                    : status === 'completed'
                    ? 'bg-[#0f1725] border-[#1e293b]'
                    : status === 'failed'
                    ? 'bg-[#291113] border-red-500/40'
                    : 'bg-transparent border-transparent opacity-40'
                }`}
              >
                <div className="flex items-center space-x-3">
                  {/* Status Indicator Icon */}
                  <div className="w-5 flex items-center justify-center font-mono">
                    {status === 'completed' && (
                      <span className="text-emerald-400 font-bold text-sm">✓</span>
                    )}
                    {status === 'running' && (
                      <div className="h-3 w-3 rounded-full border-2 border-[#38bdf8] border-t-transparent animate-spin" />
                    )}
                    {status === 'failed' && (
                      <span className="text-red-400 font-bold text-sm">✕</span>
                    )}
                    {status === 'pending' && (
                      <span className="text-slate-600 text-xs">○</span>
                    )}
                  </div>

                  {/* Stage Label */}
                  <span
                    className={`text-xs ${
                      status === 'running'
                        ? 'text-white font-semibold'
                        : status === 'completed'
                        ? 'text-slate-300 font-medium'
                        : status === 'failed'
                        ? 'text-red-300 font-semibold'
                        : 'text-slate-500 font-normal'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>

                {/* State Tag */}
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider ${
                    status === 'running'
                      ? 'text-[#38bdf8] font-bold animate-pulse'
                      : status === 'completed'
                      ? 'text-emerald-400 font-bold'
                      : status === 'failed'
                      ? 'text-red-400 font-bold'
                      : 'text-slate-600'
                  }`}
                >
                  {status === 'running' ? 'running' : status === 'completed' ? 'done' : status === 'failed' ? 'failed' : 'pending'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Live Pipeline Telemetry Footer */}
        <div className="bg-[#090d16] border border-[#1e293b] rounded-lg p-3 space-y-1.5 font-mono text-[11px]">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Engine Telemetry</span>
            <span className="text-slate-600">Zero-Disk RAM</span>
          </div>
          <p className="text-slate-300 truncate" title={currentDetail}>
            {currentDetail}
          </p>
        </div>

      </div>
    </div>
  );
}
