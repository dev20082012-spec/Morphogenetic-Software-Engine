import React from 'react';

export default function BlastRadiusView({
  blastRadius,
  onJumpToFile
}) {
  if (!blastRadius || !blastRadius.isAvailable) {
    return (
      <div className="bg-[#0d131f] border border-[#263147] rounded-lg p-4 space-y-1 font-sans text-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Impacted files
        </h3>
        <p className="text-slate-500 text-xs italic">
          {blastRadius?.summary || 'Impact unavailable from current repository evidence.'}
        </p>
      </div>
    );
  }

  const {
    directlyAffectedFile,
    dependents = [],
    dependencies = [],
    affectedTests = [],
    impactChain = []
  } = blastRadius;

  return (
    <div className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-4 font-sans text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            <span>Impacted files</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Static call-graph dependency traversal identifying affected callers, dependencies, and test suites.
          </p>
        </div>

        <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/30 font-mono">
          {dependents.length + dependencies.length + affectedTests.length} Connected Nodes
        </span>
      </div>

      {/* Visual Dependency Chain */}
      {impactChain.length > 1 && (
        <div className="bg-[#060910] border border-[#1e293b] rounded p-3 space-y-1.5">
          <span className="text-[10px] text-slate-500 font-mono uppercase font-bold">
            Propagation Path
          </span>
          <div className="flex items-center space-x-2 overflow-x-auto py-1 text-xs font-mono">
            {impactChain.map((node, i) => {
              const isTarget = node === directlyAffectedFile;
              return (
                <React.Fragment key={i}>
                  <div
                    onClick={() => onJumpToFile && onJumpToFile(node, 1)}
                    className={`px-2 py-1 rounded cursor-pointer transition shrink-0 border ${
                      isTarget
                        ? 'bg-red-950/60 text-red-300 border-red-800 font-bold'
                        : 'bg-[#111724] text-slate-300 border-[#263147] hover:border-slate-500'
                    }`}
                    title={node}
                  >
                    <span>{node.split('/').pop()}</span>
                    {isTarget && <span className="ml-1 text-[9px] text-red-400 font-normal">[target]</span>}
                  </div>

                  {i < impactChain.length - 1 && (
                    <span className="text-slate-600 select-none text-[11px]">&rarr;</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Detailed Blast Radius Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {/* Upstream Callers / Dependents */}
        <div className="bg-[#111724] border border-[#1e293b] rounded p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
            <span>Callers / Ingress</span>
            <span className="text-slate-500 font-mono text-[10px]">({dependents.length})</span>
          </div>
          {dependents.length > 0 ? (
            <div className="space-y-1">
              {dependents.map((f, i) => (
                <div
                  key={i}
                  onClick={() => onJumpToFile && onJumpToFile(f, 1)}
                  className="font-mono text-[11px] text-slate-400 hover:text-white truncate cursor-pointer transition"
                >
                  • {f}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-slate-500 text-[11px] italic">No upstream callers</span>
          )}
        </div>

        {/* Downstream Dependencies */}
        <div className="bg-[#111724] border border-[#1e293b] rounded p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
            <span>Dependencies</span>
            <span className="text-slate-500 font-mono text-[10px]">({dependencies.length})</span>
          </div>
          {dependencies.length > 0 ? (
            <div className="space-y-1">
              {dependencies.map((f, i) => (
                <div
                  key={i}
                  onClick={() => onJumpToFile && onJumpToFile(f, 1)}
                  className="font-mono text-[11px] text-slate-400 hover:text-white truncate cursor-pointer transition"
                >
                  • {f}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-slate-500 text-[11px] italic">No downstream modules</span>
          )}
        </div>

        {/* Affected Test Suites */}
        <div className="bg-[#111724] border border-[#1e293b] rounded p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
            <span>Affected Tests</span>
            <span className="text-slate-500 font-mono text-[10px]">({affectedTests.length})</span>
          </div>
          {affectedTests.length > 0 ? (
            <div className="space-y-1">
              {affectedTests.map((f, i) => (
                <div
                  key={i}
                  onClick={() => onJumpToFile && onJumpToFile(f, 1)}
                  className="font-mono text-[11px] text-emerald-400 hover:text-emerald-300 truncate cursor-pointer transition"
                >
                  • {f}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-slate-500 text-[11px] italic">No related test files</span>
          )}
        </div>
      </div>
    </div>
  );
}
