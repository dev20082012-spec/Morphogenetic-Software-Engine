import React from 'react';

export default function HeaderBar({ 
  selectedPreset, 
  onSelectPreset, 
  energyScore, 
  status 
}) {
  return (
    <header className="border-b border-[#263147] bg-[#0d131f] px-4 py-2 flex items-center justify-between shrink-0 select-none">
      <div className="flex items-center space-x-3">
        <div className="h-7 w-7 rounded-sm bg-[#1e293b] border border-[#334155] flex items-center justify-center font-mono font-bold text-xs text-[#38bdf8]">
          MSE
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xs font-bold tracking-wider text-slate-100 font-mono">PROJECT MSE</h1>
            <span className="text-[9px] uppercase font-mono font-semibold px-1 py-0.5 rounded-sm bg-[#162032] text-slate-400 border border-[#24334d]">
              IDE WORKBENCH v2.0
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Autonomous AST Homeostasis and CEGIS Prover</p>
        </div>
      </div>

      <div className="hidden md:flex items-center space-x-2 font-mono text-xs">
        <span className="text-slate-500 text-[10px]">BENCHMARK TARGET:</span>
        <button
          onClick={() => onSelectPreset('payment')}
          className={`px-2.5 py-1 rounded-sm text-xs font-mono border ${
            selectedPreset === 'payment'
              ? 'bg-[#1e293b] text-slate-100 border-[#38bdf8] font-bold'
              : 'bg-[#111724] text-slate-400 border-[#263147] hover:text-slate-200'
          }`}
        >
          fintech/payment-gateway-core
        </button>
        <button
          onClick={() => onSelectPreset('consensus')}
          className={`px-2.5 py-1 rounded-sm text-xs font-mono border ${
            selectedPreset === 'consensus'
              ? 'bg-[#1e293b] text-slate-100 border-[#38bdf8] font-bold'
              : 'bg-[#111724] text-slate-400 border-[#263147] hover:text-slate-200'
          }`}
        >
          infrastructure/raft-distributed-kv
        </button>
      </div>

      <div className="flex items-center space-x-3 font-mono text-xs">
        <div className="flex items-center space-x-2 bg-[#111724] border border-[#263147] px-2 py-0.5 rounded-sm">
          <span className="text-[10px] text-slate-400">Energy E(S):</span>
          <span className="font-bold text-slate-200">
            {energyScore.toFixed(3)}
          </span>
          {status === 'converged' && (
            <span className="text-[9px] text-[#4ade80] font-bold">(-0.450 dE)</span>
          )}
        </div>

        <div className="hidden lg:flex items-center space-x-1.5 text-slate-400 border border-[#263147] px-2 py-0.5 rounded-sm bg-[#111724]">
          <span className="text-[10px] text-[#4ade80] font-mono">Zero-Retention RAM Mode</span>
        </div>
      </div>
    </header>
  );
}
