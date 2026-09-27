import React, { useRef, useEffect } from 'react';

const PIPELINE_STAGES = [
  { id: 'INGESTING', label: '1. INGESTING', desc: 'RAM Snapshot' },
  { id: 'ANALYZING', label: '2. ANALYZING', desc: 'Alpha Call-Graph' },
  { id: 'RECONCILING', label: '3. RECONCILING', desc: 'Beta Spec Drift' },
  { id: 'SEARCHING', label: '4. SEARCHING', desc: 'Invariants Search' },
  { id: 'SYNTHESIZING', label: '5. SYNTHESIZING', desc: 'Gamma & Repairs' },
  { id: 'VERIFYING', label: '6. VERIFYING', desc: 'CEGIS Prover' },
  { id: 'COMPLETE', label: '7. COMPLETE', desc: 'Audit Complete' },
];

export default function VerificationConsole({ 
  status, 
  currentStage,
  logs = [], 
  onRunAudit, 
  onReRunVerification,
  onReset, 
  isExpanded, 
  onToggleExpand,
  durationMs
}) {
  const terminalEndRef = useRef(null);

  useEffect(() => {
    if (isExpanded) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  return (
    <div className="bg-[#090d16] border-t border-[#263147] font-mono text-xs shrink-0 select-none">
      {/* Console Top Toolbar */}
      <div className="px-3 py-1.5 bg-[#0d131f] border-b border-[#263147] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-[#38bdf8] font-bold">CONSOLE:</span>
          <span className="text-slate-300 font-semibold">ENGINE TELEMETRY</span>
          <span className="text-slate-600">|</span>
          <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-bold uppercase border ${
            status === 'converged' || status === 'verified'
              ? 'bg-[#13281c] text-[#4ade80] border-[#166534]'
              : status === 'running'
              ? 'bg-[#1b2b45] text-[#38bdf8] border-[#38bdf8]'
              : 'bg-[#111724] text-slate-400 border border-[#263147]'
          }`}>
            {status === 'running' ? 'ANALYSIS PIPELINE RUNNING' : status === 'converged' || status === 'verified' ? 'HOMEOSTASIS CONVERGED (0 UNVERIFIED)' : 'ENGINE IDLE (READY)'}
          </span>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={onRunAudit}
            disabled={status === 'running'}
            className="px-2.5 py-0.5 bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] disabled:opacity-50 text-slate-100 rounded-sm text-[11px] font-bold transition"
          >
            {status === 'running' ? 'Running Audit...' : 'Run MSE Audit'}
          </button>

          <button
            onClick={onReRunVerification}
            disabled={status === 'running'}
            className="px-2 py-0.5 bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-300 hover:text-white rounded-sm text-[11px] transition"
          >
            Re-run Verification
          </button>

          <button
            onClick={onReset}
            className="px-2 py-0.5 bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-400 hover:text-slate-200 rounded-sm text-[11px]"
            title="Reset repository to baseline"
          >
            Reset
          </button>

          <button
            onClick={onToggleExpand}
            className="px-1.5 py-0.5 text-slate-400 hover:text-slate-200 rounded-sm text-[10px]"
            title={isExpanded ? 'Collapse Console' : 'Expand Console'}
          >
            {isExpanded ? '[v]' : '[^]'}
          </button>
        </div>
      </div>

      {/* Execution Stages Track */}
      <div className="px-3 py-1.5 bg-[#0b0f19] border-b border-[#1e293b] flex items-center justify-between text-[11px] overflow-x-auto gap-2">
        <div className="flex items-center space-x-2">
          {PIPELINE_STAGES.map((stage, idx) => {
            const isStageActive = currentStage === stage.id;
            const stageIndex = PIPELINE_STAGES.findIndex(s => s.id === currentStage);
            const isPassed = stageIndex > idx || currentStage === 'COMPLETE';

            return (
              <div 
                key={stage.id}
                className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-sm border transition text-[10px] ${
                  isStageActive
                    ? 'bg-[#1b2b45] text-[#38bdf8] border-[#38bdf8] font-bold'
                    : isPassed
                    ? 'bg-[#13281c] text-[#4ade80] border-[#166534]'
                    : 'bg-[#111724] text-slate-500 border-transparent'
                }`}
              >
                <span>{isPassed ? '✓' : isStageActive ? '▶' : '○'}</span>
                <span>{stage.label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center space-x-3 text-[10px] text-slate-400 shrink-0">
          <div>
            <span>RAM: </span>
            <span className="text-slate-200 font-bold">
              {typeof performance !== 'undefined' && performance?.memory?.usedJSHeapSize
                ? `${(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)} MB`
                : 'Zero-Disk'}
            </span>
          </div>
          <div>
            <span>Duration: </span>
            <span className="text-[#38bdf8] font-bold">{durationMs > 0 ? `${durationMs}ms` : '--'}</span>
          </div>
        </div>
      </div>

      {/* Console Log Area */}
      {isExpanded && (
        <div className="p-2.5 bg-[#060910] max-h-36 overflow-y-auto space-y-0.5 font-mono text-[11px] leading-relaxed">
          {logs.map((log, index) => {
            const isCritical = typeof log === 'string' && (log.includes('CRITICAL') || log.includes('error') || log.includes('FAILED') || log.includes('violated'));
            const isSuccess = typeof log === 'string' && (log.includes('done') || log.includes('passed') || log.includes('complete') || log.includes('VERIFIED') || log.includes('satisfied'));
            const isRunning = typeof log === 'string' && log.includes('running');

            return (
              <div key={index} className="flex items-start space-x-1.5">
                <span className="text-slate-600 select-none shrink-0">&gt;</span>
                <span
                  className={
                    isCritical
                      ? 'text-[#f87171] font-semibold'
                      : isSuccess
                      ? 'text-[#4ade80]'
                      : isRunning
                      ? 'text-[#38bdf8]'
                      : 'text-slate-300'
                  }
                >
                  {log}
                </span>
              </div>
            );
          })}
          <div ref={terminalEndRef} />
        </div>
      )}
    </div>
  );
}
