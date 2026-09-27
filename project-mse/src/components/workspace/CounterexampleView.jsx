import React, { useState } from 'react';

export default function CounterexampleView({
  counterexamples,
  onViewPatch
}) {
  const items = counterexamples?.counterexamples || [];
  const [selectedId, setSelectedId] = useState(items[0]?.id || null);
  const [copied, setCopied] = useState(false);

  const activeItem = items.find(cx => cx.id === selectedId) || items[0];

  const handleCopy = () => {
    if (!activeItem?.testCode) return;
    navigator.clipboard.writeText(activeItem.testCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center font-mono bg-[#090d16] text-slate-400 space-y-2">
        <span className="text-2xl">🛡️</span>
        <h3 className="text-sm font-bold text-slate-200">No Counterexamples Synthesized</h3>
        <p className="text-xs max-w-md text-slate-500">
          All formal system invariants are currently satisfied. The CEGIS search found no reachable falsification trajectories.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden font-mono text-xs bg-[#090d16]">
      {/* Counterexamples Sidebar */}
      <div className="w-72 border-r border-[#263147] bg-[#0d131f] flex flex-col shrink-0">
        <div className="p-2.5 border-b border-[#263147] flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
            CEGIS ANTIGENS ({items.length})
          </span>
          <span className="text-[10px] bg-[#2a1215] text-[#f87171] border border-[#7f1d1d] px-1 py-0.2 rounded-sm font-bold">
            Gamma Core
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {items.map((cx) => {
            const isSelected = activeItem?.id === cx.id;

            return (
              <div
                key={cx.id}
                onClick={() => setSelectedId(cx.id)}
                className={`p-2.5 rounded-sm cursor-pointer border transition ${
                  isSelected
                    ? 'bg-[#1e293b] border-[#38bdf8] text-slate-100'
                    : 'bg-[#111724] border-[#263147] hover:border-slate-600 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[#38bdf8] font-bold text-[11px]">
                    [{cx.id}]
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded-sm font-bold uppercase bg-[#162032] text-slate-300 border border-[#24334d]">
                    {cx.invariantId}
                  </span>
                </div>

                <div className="font-semibold text-xs leading-snug line-clamp-2">
                  {cx.description}
                </div>

                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="text-[#f87171] font-semibold">FAILS [RED]</span>
                  <span className="text-slate-500">Vitest</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Detail Area */}
      {activeItem ? (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4">
          {/* Header Card */}
          <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-[#38bdf8] font-bold text-xs">
                  [{activeItem.id}]
                </span>
                <span className="font-bold text-sm text-slate-100">
                  Target Invariant: <code className="text-[#38bdf8] font-semibold">{activeItem.invariantId}</code>
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase bg-[#2a1215] text-[#f87171] border border-[#7f1d1d]">
                  TEST FAILING (RED)
                </span>
                <span className="text-[10px] text-slate-500">
                  Falsification Proof
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {activeItem.description}
            </p>
          </div>

          {/* Triggering Scenario & Root Cause */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3 space-y-2">
              <span className="text-[10px] text-[#fbbf24] uppercase font-bold tracking-wider block">
                TRIGGERING SCENARIO (EXPLOIT TRAJECTORY)
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                {activeItem.scenario}
              </p>
            </div>

            <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3 space-y-2">
              <span className="text-[10px] text-[#f87171] uppercase font-bold tracking-wider block">
                ISOLATED ROOT CAUSE
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                {activeItem.rootCause}
              </p>
            </div>
          </div>

          {/* Generated Regression Test Code */}
          <div className="bg-[#0d131f] border border-[#263147] rounded-sm flex flex-col flex-1 overflow-hidden">
            <div className="bg-[#111724] border-b border-[#263147] p-2.5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-200 text-xs uppercase">
                  SYNTHESIZED REGRESSION TEST ARTIFACT
                </span>
                <span className="text-[9px] bg-[#162032] text-slate-400 border border-[#24334d] px-1 py-0.2 rounded-sm">
                  vitest / immune antigen
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopy}
                  className="px-2 py-0.5 rounded-sm text-[11px] font-mono border border-[#263147] text-slate-400 hover:text-slate-200 hover:bg-[#111724]"
                >
                  {copied ? 'Copied' : 'Copy Test'}
                </button>
              </div>
            </div>

            <div className="p-3 bg-[#060910] overflow-x-auto flex-1 font-mono text-xs leading-relaxed text-slate-300">
              <pre className="whitespace-pre">{activeItem.testCode}</pre>
            </div>
          </div>

          {/* Action Footer */}
          <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3 flex items-center justify-between">
            <span className="text-slate-400 text-xs">
              When applied, the synthesized repair patch restores homeostasis and causes this test to pass [GREEN].
            </span>

            <button
              onClick={() => onViewPatch()}
              className="px-3 py-1 bg-[#13281c] border border-[#166534] text-[#4ade80] hover:bg-[#1a3825] rounded-sm text-xs font-bold"
            >
              Inspect Repair Patch &rarr;
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
