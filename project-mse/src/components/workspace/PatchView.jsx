import React, { useState } from 'react';
import { parseUnifiedDiff } from '../../utils/diffUtils';
import { downloadFile } from '../../utils/downloadUtils';

export default function PatchView({
  patches,
  appliedPatchIds,
  onApplyPatch,
  onApplyAllPatches,
  onReRunVerification,
  targetFile
}) {
  const patchList = patches?.patches || [];
  
  // If targetFile passed, select that patch, otherwise first patch
  const initialSelected = targetFile 
    ? patchList.find(p => p.targetFile === targetFile)?.id || patchList[0]?.id
    : patchList[0]?.id;

  const [selectedPatchId, setSelectedPatchId] = useState(initialSelected || null);

  const activePatch = patchList.find(p => p.id === selectedPatchId) || patchList[0];

  const handleDownloadSinglePatch = (patch) => {
    if (!patch) return;
    const filename = `${patch.id}-${patch.targetFile.replace(/[/\\]/g, '_')}.patch`;
    downloadFile(filename, patch.diff, 'text/x-diff');
  };

  if (patchList.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center font-mono bg-[#090d16] text-slate-400 space-y-2">
        <span className="text-2xl">✨</span>
        <h3 className="text-sm font-bold text-slate-200">No Candidate Patches Required</h3>
        <p className="text-xs max-w-md text-slate-500">
          The codebase satisfies all bound invariants. No atomic repair syntheses were generated.
        </p>
      </div>
    );
  }

  const chunks = activePatch ? parseUnifiedDiff(activePatch.diff) : [];
  const isApplied = activePatch ? appliedPatchIds.includes(activePatch.id) : false;
  const allApplied = patchList.every(p => appliedPatchIds.includes(p.id));

  return (
    <div className="flex-1 flex overflow-hidden font-mono text-xs bg-[#090d16]">
      {/* Patches List Sidebar */}
      <div className="w-72 border-r border-[#263147] bg-[#0d131f] flex flex-col shrink-0">
        <div className="p-2.5 border-b border-[#263147] flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
            SYNTHESIZED PATCHES ({patchList.length})
          </span>
          <span className="text-[10px] bg-[#13281c] text-[#4ade80] border border-[#166534] px-1 py-0.2 rounded-sm font-bold">
            CEGIS Prover
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {patchList.map((patch) => {
            const isSelected = activePatch?.id === patch.id;
            const applied = appliedPatchIds.includes(patch.id);

            return (
              <div
                key={patch.id}
                onClick={() => setSelectedPatchId(patch.id)}
                className={`p-2.5 rounded-sm cursor-pointer border transition ${
                  isSelected
                    ? 'bg-[#1e293b] border-[#38bdf8] text-slate-100'
                    : 'bg-[#111724] border-[#263147] hover:border-slate-600 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[#38bdf8] font-bold text-[11px]">
                    [{patch.id}]
                  </span>
                  <span className={`text-[9px] px-1 py-0.2 rounded-sm font-bold uppercase border ${
                    applied
                      ? 'bg-[#13281c] text-[#4ade80] border-[#166534]'
                      : 'bg-[#162032] text-slate-300 border-[#24334d]'
                  }`}>
                    {applied ? 'APPLIED IN RAM' : 'CANDIDATE'}
                  </span>
                </div>

                <div className="font-semibold text-xs leading-snug line-clamp-2">
                  {patch.description}
                </div>

                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span className="truncate max-w-[130px]">{patch.targetFile}</span>
                  <span className="text-[#38bdf8] uppercase font-semibold">{patch.confidence}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-2 border-t border-[#263147] bg-[#090d16]">
          <button
            onClick={onApplyAllPatches}
            disabled={allApplied}
            className="w-full py-1.5 px-2 bg-[#13281c] hover:bg-[#1a3825] disabled:opacity-50 border border-[#166534] text-[#4ade80] rounded-sm text-xs font-bold transition"
          >
            {allApplied ? 'All Patches Applied in RAM' : `Apply All Patches (${patchList.length})`}
          </button>
        </div>
      </div>

      {/* Main Diff Area */}
      {activePatch ? (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4">
          {/* Header Card */}
          <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3.5 space-y-2">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-[#38bdf8] font-bold text-xs">
                    [{activePatch.id}]
                  </span>
                  <span className="font-bold text-sm text-slate-100">
                    {activePatch.description}
                  </span>
                </div>

                <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                  <span>Target: <code className="text-[#38bdf8] font-semibold">{activePatch.targetFile}</code></span>
                  <span>|</span>
                  <span>Strategy: <span className="text-slate-200 font-semibold">{activePatch.strategy}</span></span>
                  <span>|</span>
                  <span>Confidence: <span className="text-[#4ade80] uppercase font-bold">{activePatch.confidence}</span></span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownloadSinglePatch(activePatch)}
                  className="px-2.5 py-1 rounded-sm bg-[#111724] border border-[#263147] hover:bg-[#1e293b] text-slate-300 text-xs font-semibold"
                >
                  Download .patch
                </button>

                <button
                  onClick={() => onApplyPatch(activePatch)}
                  disabled={isApplied}
                  className={`px-3 py-1 rounded-sm text-xs font-bold transition border ${
                    isApplied
                      ? 'bg-[#13281c] text-[#4ade80] border-[#166534] cursor-default'
                      : 'bg-[#1e293b] hover:bg-[#334155] border-[#38bdf8] text-slate-100'
                  }`}
                >
                  {isApplied ? 'Patch Applied in RAM' : 'Apply Patch to In-Memory Repo'}
                </button>
              </div>
            </div>
          </div>

          {/* Unified Diff View */}
          <div className="border border-[#263147] rounded-sm overflow-hidden bg-[#090d16]">
            <div className="bg-[#0f1726] px-3 py-1.5 text-[11px] text-slate-300 border-b border-[#263147] flex items-center justify-between">
              <span className="font-bold text-[#38bdf8]">UNIFIED DIFF &mdash; {activePatch.targetFile}</span>
              <span className="text-slate-500 text-[10px]">Git patch format</span>
            </div>

            <div className="divide-y divide-[#162032]">
              {chunks.map((chunk, cIdx) => (
                <div key={cIdx} className="space-y-0">
                  <div className="bg-[#0a101d] px-3 py-1 text-[11px] text-[#38bdf8] border-b border-[#1e293b] font-bold">
                    {chunk.header}
                  </div>

                  {chunk.lines.map((line, lIdx) => {
                    const isAdd = line.type === 'add';
                    const isRemove = line.type === 'remove';

                    return (
                      <div
                        key={lIdx}
                        className={`flex items-stretch text-xs leading-relaxed font-mono ${
                          isAdd
                            ? 'bg-[#0f241a] text-[#86efac]'
                            : isRemove
                            ? 'bg-[#291316] text-[#fca5a5]'
                            : 'text-slate-400 hover:bg-[#111724]'
                        }`}
                      >
                        <span className="w-10 text-right pr-2 py-0.5 select-none text-[10px] text-slate-600 bg-[#0c101c] border-r border-[#1e293b]">
                          {line.oldNum || ''}
                        </span>
                        <span className="w-10 text-right pr-2 py-0.5 select-none text-[10px] text-slate-600 bg-[#0c101c] border-r border-[#263147]">
                          {line.newNum || ''}
                        </span>
                        <span className={`w-5 text-center py-0.5 select-none font-bold ${
                          isAdd ? 'text-[#4ade80]' : isRemove ? 'text-[#f87171]' : 'text-slate-600'
                        }`}>
                          {isAdd ? '+' : isRemove ? '-' : ' '}
                        </span>
                        <div className="flex-1 px-2 py-0.5 whitespace-pre overflow-x-auto">
                          {line.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Post-patch verification note */}
          {isApplied && (
            <div className="bg-[#0d131f] border border-[#166534] rounded-sm p-3 flex items-center justify-between">
              <span className="text-xs text-[#4ade80]">
                Patch applied to in-memory repository representation. Re-run verification to validate homeostasis.
              </span>
              <button
                onClick={onReRunVerification}
                className="px-3 py-1 bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-slate-100 rounded-sm text-xs font-bold"
              >
                Re-run Verification &rarr;
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
