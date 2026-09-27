import React from 'react';
import { downloadPatches, downloadJsonReport } from '../utils/downloadUtils';

export default function InvariantInspector({ 
  invariants = [], 
  selectedInvariant, 
  onJumpToInvariant,
  onOpenDiff,
  onOpenCounterexample,
  patches = [],
  findings = [],
  reportJson,
  repoName
}) {
  const invariantList = invariants || [];
  const violatedCount = invariantList.filter(i => i.status === 'violated').length;
  const criticalFindings = findings.filter(f => f.severity === 'CRITICAL');
  const driftFindings = findings.filter(f => f.type === 'drift');

  return (
    <aside className="w-80 border-l border-[#263147] bg-[#0d131f] flex flex-col h-full shrink-0 select-none font-mono">
      {/* Rail Header */}
      <div className="p-2.5 border-b border-[#263147] flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
          SYSTEM INVARIANTS ({invariantList.length})
        </span>
        <span className={`text-[10px] px-1.5 py-0.2 rounded-sm font-bold uppercase border ${
          violatedCount > 0
            ? 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
            : 'bg-[#13281c] text-[#4ade80] border-[#166534]'
        }`}>
          {violatedCount > 0 ? `${violatedCount} Violated` : 'All Satisfied'}
        </span>
      </div>

      {/* Risk Summary Card */}
      <div className="p-2.5 border-b border-[#263147] bg-[#090d16] space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-slate-300 uppercase text-[10px]">Actual Risk Assessment</span>
          <span className={`font-bold text-[10px] ${criticalFindings.length > 0 ? 'text-[#f87171]' : 'text-[#4ade80]'}`}>
            {criticalFindings.length > 0 ? 'HIGH RISK' : 'LOW RISK'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
          <div className="bg-[#111724] border border-[#1e293b] p-1 rounded-sm">
            <span className="text-slate-500 block text-[9px]">CRITICAL</span>
            <span className="font-bold text-[#f87171]">{criticalFindings.length}</span>
          </div>
          <div className="bg-[#111724] border border-[#1e293b] p-1 rounded-sm">
            <span className="text-slate-500 block text-[9px]">DRIFT</span>
            <span className="font-bold text-[#fbbf24]">{driftFindings.length}</span>
          </div>
          <div className="bg-[#111724] border border-[#1e293b] p-1 rounded-sm">
            <span className="text-slate-500 block text-[9px]">PATCHES</span>
            <span className="font-bold text-[#4ade80]">{patches.length}</span>
          </div>
        </div>
      </div>

      {/* Invariants List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {invariantList.map((inv) => {
          const isSelected = selectedInvariant?.id === inv.id;
          const isViolated = inv.status === 'violated';
          const primaryEvidence = inv.evidence?.[0] || null;

          return (
            <div
              key={inv.id}
              onClick={() => onJumpToInvariant(inv, primaryEvidence)}
              className={`rounded-sm p-2.5 text-xs cursor-pointer border transition ${
                isSelected
                  ? 'bg-[#152033] border-[#38bdf8]'
                  : 'bg-[#111724] border-[#263147] hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[#38bdf8] font-bold text-xs">[{inv.id}]</span>
                  <span className="text-[9px] uppercase px-1 py-0.2 rounded-sm bg-[#162032] text-slate-300 border border-[#24334d]">
                    {inv.category}
                  </span>
                </div>

                <span className={`text-[9px] px-1 py-0.2 rounded-sm font-bold uppercase border ${
                  isViolated
                    ? 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
                    : 'bg-[#13281c] text-[#4ade80] border-[#166534]'
                }`}>
                  {inv.status}
                </span>
              </div>

              <h4 className="text-slate-200 font-semibold text-xs leading-snug mb-1">
                {inv.name}
              </h4>

              <p className="text-slate-400 text-[11px] leading-relaxed mb-2 line-clamp-3">
                {inv.statement}
              </p>

              {/* Evidence details */}
              {primaryEvidence && (
                <div className="pt-1.5 border-t border-[#1e293b] space-y-1 text-[10px]">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">Source:</span>
                    <span className="text-[#38bdf8] font-semibold truncate max-w-[170px]">
                      {primaryEvidence.file}{primaryEvidence.line ? `:${primaryEvidence.line}` : ''}
                    </span>
                  </div>

                  {primaryEvidence.context && (
                    <div className="text-slate-400 truncate text-[10px]">
                      {primaryEvidence.context}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-2.5 pt-1.5 border-t border-[#1e293b] flex items-center justify-between flex-wrap gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToInvariant(inv, primaryEvidence);
                  }}
                  className="px-1.5 py-0.5 rounded-sm bg-[#162032] border border-[#24334d] hover:border-[#38bdf8] text-[#38bdf8] text-[10px] font-semibold"
                >
                  Jump to Source
                </button>

                {isViolated && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCounterexample(inv);
                    }}
                    className="px-1.5 py-0.5 rounded-sm bg-[#2a1215] border border-[#7f1d1d] text-[#f87171] hover:bg-[#3d191d] text-[10px] font-semibold"
                  >
                    Antigen Test
                  </button>
                )}

                {primaryEvidence?.file && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDiff(primaryEvidence.file);
                    }}
                    className="px-1.5 py-0.5 rounded-sm bg-[#13281c] border border-[#166534] text-[#4ade80] hover:bg-[#1a3825] text-[10px] font-semibold"
                  >
                    Diff
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Export actions */}
      <div className="p-2 border-t border-[#263147] bg-[#090d16] space-y-1.5 shrink-0">
        <button
          onClick={() => downloadPatches(patches, repoName)}
          disabled={patches.length === 0}
          className="w-full py-1 px-2 rounded-sm text-xs font-mono font-bold bg-[#13281c] hover:bg-[#1a3825] border border-[#166534] text-[#4ade80] disabled:opacity-40 transition flex items-center justify-center space-x-1.5"
        >
          <span>Download Patch (.patch)</span>
          {patches.length > 0 && <span>({patches.length})</span>}
        </button>

        <button
          onClick={() => downloadJsonReport(reportJson, repoName)}
          disabled={!reportJson}
          className="w-full py-1 px-2 rounded-sm text-xs font-mono bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-300 disabled:opacity-40 transition"
        >
          Export JSON Report (.json)
        </button>
      </div>
    </aside>
  );
}
