import React from 'react';

export default function InvariantInspector({ 
  invariants, 
  selectedInvariant, 
  onJumpToInvariant,
  onOpenDiff 
}) {
  return (
    <div className="w-72 border-l border-[#263147] bg-[#0d131f] flex flex-col h-full shrink-0 select-none">
      <div className="p-2.5 border-b border-[#263147] flex items-center justify-between">
        <span className="text-[11px] font-mono font-bold text-slate-200 uppercase tracking-wider">
          SYSTEM INVARIANTS (AST)
        </span>
        <span className="text-[10px] font-mono bg-[#2a1215] text-[#f87171] border border-[#7f1d1d] px-1 py-0.5 rounded-sm font-bold">
          {invariants.filter(i => i.severity === 'CRITICAL').length} Critical
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {invariants.map((inv) => {
          const isSelected = selectedInvariant?.id === inv.id;
          const isCritical = inv.severity === 'CRITICAL';
          const isDrift = inv.type === 'EPIGENETIC_DRIFT';

          return (
            <div
              key={inv.id}
              onClick={() => onJumpToInvariant(inv)}
              className={`rounded-sm p-2.5 font-mono text-xs cursor-pointer border ${
                isSelected
                  ? 'bg-[#152033] border-[#38bdf8]'
                  : 'bg-[#111724] border-[#263147] hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[#38bdf8] font-bold text-xs">[{inv.id}]</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded-sm font-bold uppercase border ${
                    isCritical 
                      ? 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
                      : isDrift
                      ? 'bg-[#291e0b] text-[#fbbf24] border-[#78350f]'
                      : 'bg-[#162032] text-slate-300 border-[#24334d]'
                  }`}>
                    {inv.severity}
                  </span>
                </div>

                <span className="text-[10px] text-slate-500">
                  +{inv.penalty.toFixed(2)} E(S)
                </span>
              </div>

              <h4 className="text-slate-200 font-semibold text-xs leading-snug mb-1">
                {inv.title}
              </h4>
              <p className="text-slate-400 text-[11px] leading-relaxed mb-2">
                {inv.description}
              </p>

              <div className="pt-1.5 border-t border-[#1e293b] space-y-1 text-[10px]">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">File and Line:</span>
                  <span className="text-[#38bdf8] font-semibold underline">
                    {inv.targetFile}:{inv.line}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">AST Node:</span>
                  <span className="text-slate-300 truncate max-w-[130px] text-right">
                    {inv.astNode}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 pt-1.5 border-t border-[#1e293b] flex items-center justify-between">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToInvariant(inv);
                  }}
                  className="px-1.5 py-0.5 rounded-sm bg-[#162032] border border-[#24334d] hover:border-[#38bdf8] text-[#38bdf8] text-[10px] font-semibold"
                >
                  Jump to AST Node
                </button>

                {inv.hasPatch && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDiff(inv.targetFile);
                    }}
                    className="px-1.5 py-0.5 rounded-sm bg-[#13281c] border border-[#166534] text-[#4ade80] text-[10px] font-semibold"
                  >
                    View Diff
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
