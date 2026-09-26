import React, { useRef, useEffect } from 'react';

export default function VerificationConsole({ 
  status, 
  currentPass, 
  passes, 
  logs, 
  onRunVerification, 
  onStepPass, 
  onReset, 
  isExpanded, 
  onToggleExpand 
}) {
  const terminalEndRef = useRef(null);

  useEffect(() => {
    if (isExpanded) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  const memoryUsage = (28.4 + (currentPass * 4.2)).toFixed(1);
  const tokenAllocation = (currentPass * 3560) + 4280;
  const activePassData = passes[currentPass - 1] || passes[0];

  return (
    <div className="bg-[#090d16] border-t border-[#263147] font-mono text-xs shrink-0 select-none">
      <div className="px-3 py-1.5 bg-[#0d131f] border-b border-[#263147] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-[#38bdf8] font-bold">CONSOLE:</span>
          <span className="text-slate-300 font-semibold">VERIFICATION TELEMETRY</span>
          <span className="text-slate-600">|</span>
          <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-bold ${
            status === 'converged'
              ? 'bg-[#13281c] text-[#4ade80] border border-[#166534]'
              : status === 'running'
              ? 'bg-[#1b2b45] text-[#38bdf8] border border-[#38bdf8]'
              : 'bg-[#111724] text-slate-400 border border-[#263147]'
          }`}>
            {status === 'converged' ? 'HOMEOSTASIS CONVERGED (0 ENTROPY)' : status === 'running' ? 'CEGIS PROVER RUNNING' : 'IDLE (READY)'}
          </span>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={onRunVerification}
            disabled={status === 'running'}
            className="px-2.5 py-0.5 bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] disabled:opacity-50 text-slate-100 rounded-sm text-[11px] font-bold"
          >
            {status === 'running' ? 'Running CEGIS...' : 'Run CEGIS Verification'}
          </button>

          <button
            onClick={onStepPass}
            disabled={status === 'running' || currentPass >= passes.length}
            className="px-2 py-0.5 bg-[#111724] hover:bg-[#1e293b] disabled:opacity-40 border border-[#263147] text-slate-300 rounded-sm text-[11px]"
          >
            Step AST Pass ({currentPass}/{passes.length})
          </button>

          <button
            onClick={onReset}
            className="px-2 py-0.5 bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-400 hover:text-slate-200 rounded-sm text-[11px]"
            title="Reset verification state"
          >
            Reset
          </button>

          <button
            onClick={onToggleExpand}
            className="px-1.5 py-0.5 text-slate-400 hover:text-slate-200 rounded-sm text-[10px]"
          >
            {isExpanded ? '[v]' : '[^]'}
          </button>
        </div>
      </div>

      <div className="px-3 py-1 bg-[#0b0f19] border-b border-[#1e293b] flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <span>Ephemeral Heap:</span>
            <span className="text-slate-200 font-bold">{memoryUsage} MB</span>
            <span className="text-slate-600">/ 512 MB</span>
          </div>

          <div className="flex items-center space-x-1">
            <span>AST Token Budget:</span>
            <span className="text-[#38bdf8] font-bold">{tokenAllocation.toLocaleString()} tokens</span>
          </div>

          <div className="flex items-center space-x-1">
            <span>Current Pass:</span>
            <span className="text-slate-200">{activePassData.name}</span>
          </div>
        </div>

        <div className="flex items-center space-x-1 text-[10px] text-[#4ade80]">
          <span>Zero-Leakage Pre-Flight Shield: ACTIVE (RAM ONLY)</span>
        </div>
      </div>

      {isExpanded && (
        <div className="p-2.5 bg-[#060910] max-h-36 overflow-y-auto space-y-0.5 font-mono text-[11px] leading-relaxed">
          {logs.map((log, index) => {
            const isCritical = log.includes('CRITICAL') || log.includes('Vulnerability') || log.includes('FAILING');
            const isSuccess = log.includes('Convergence') || log.includes('ZERO ENTROPY') || log.includes('PASSING');
            const isAlpha = log.includes('ALPHA:');
            const isBeta = log.includes('BETA:');
            const isGamma = log.includes('GAMMA:');

            return (
              <div key={index} className="flex items-start space-x-1.5">
                <span className="text-slate-600 select-none shrink-0">&gt;</span>
                <span
                  className={
                    isCritical
                      ? 'text-[#f87171] font-semibold'
                      : isSuccess
                      ? 'text-[#4ade80] font-bold'
                      : isAlpha
                      ? 'text-[#38bdf8]'
                      : isBeta
                      ? 'text-[#93c5fd]'
                      : isGamma
                      ? 'text-[#fcd34d]'
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
