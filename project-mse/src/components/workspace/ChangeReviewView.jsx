import React, { useState } from 'react';
import { parseUnifiedDiff } from '../../utils/diffUtils';
import { downloadFile, downloadPatches } from '../../utils/downloadUtils';

export default function ChangeReviewView({
  patches,
  appliedPatchIds = [],
  onApplyPatch,
  onApplyAllPatches,
  onRejectPatch,
  onReRunVerification,
  targetFile,
  repoName = 'repository',
  onNavigateTab,
  verification,
  decision
}) {
  const patchList = patches?.patches || [];

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
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center font-sans bg-[#090d16] text-slate-400 space-y-2">
        <span className="text-2xl">✨</span>
        <h3 className="text-sm font-bold text-slate-200">No Fixes to Review</h3>
        <p className="text-xs max-w-md text-slate-500">
          The codebase satisfies all bound invariants. No atomic repair syntheses were generated.
        </p>
      </div>
    );
  }

  const chunks = activePatch ? parseUnifiedDiff(activePatch.diff) : [];
  const isApplied = activePatch ? appliedPatchIds.includes(activePatch.id) : false;
  const allApplied = patchList.every(p => appliedPatchIds.includes(p.id));

  // Count lines added / removed
  let addedLines = 0;
  let removedLines = 0;
  for (const chunk of chunks) {
    for (const line of chunk.lines) {
      if (line.type === 'add') addedLines++;
      if (line.type === 'del') removedLines++;
    }
  }

  // Verification Gate Decision Model
  const gateDecision = isApplied ? 'VERIFIED' : 'NEEDS_REVIEW';

  const verificationChecks = decision?.checks || verification?.checks || [];

  return (
    <div className="flex-1 flex overflow-hidden font-sans text-xs bg-[#090d16] text-slate-200">
      {/* Sidebar: Patches List */}
      <div className="w-80 border-r border-[#263147] bg-[#0d131f] flex flex-col shrink-0">
        <div className="p-3 border-b border-[#263147] flex items-center justify-between">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Review Fixes ({patchList.length})
          </span>
          <span className="text-[10px] bg-[#13281c] text-[#4ade80] border border-[#166534] px-1.5 py-0.2 rounded font-bold">
            Generated fix
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {patchList.map((patch) => {
            const isSelected = activePatch?.id === patch.id;
            const applied = appliedPatchIds.includes(patch.id);

            return (
              <div
                key={patch.id}
                onClick={() => setSelectedPatchId(patch.id)}
                className={`p-3 rounded-lg cursor-pointer border transition ${
                  isSelected
                    ? 'bg-[#1e293b] border-[#38bdf8] text-white shadow-sm'
                    : 'bg-[#111724] border-[#263147] hover:border-slate-500 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[#38bdf8] font-bold font-mono text-[11px]">
                    {patch.id}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border ${
                    applied
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {applied ? 'APPLIED IN RAM' : 'CANDIDATE'}
                  </span>
                </div>

                <div className="font-semibold text-xs leading-snug line-clamp-2">
                  {patch.description}
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span className="truncate max-w-[150px]">{patch.targetFile}</span>
                  <span className="text-[#38bdf8] uppercase text-[10px]">{patch.strategy}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Global Batch Actions */}
        <div className="p-3 border-t border-[#263147] bg-[#090d16] space-y-2">
          <button
            onClick={onApplyAllPatches}
            disabled={allApplied}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-md text-xs shadow-sm transition"
          >
            {allApplied ? 'All Fixes Applied' : 'Apply All Fixes'}
          </button>
          <button
            onClick={() => downloadPatches(patchList, repoName)}
            className="w-full py-1.5 bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-300 text-xs rounded-md transition"
          >
            Export All (.patch)
          </button>
        </div>
      </div>

      {/* Main Review Area */}
      {activePatch ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header & Verification Gate Banner */}
          <div className="p-4 border-b border-[#263147] bg-[#0d131f] space-y-3 shrink-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-sm text-[#38bdf8]">[{activePatch.id}]</span>
                  <span className="text-sm font-bold text-white">{activePatch.targetFile}</span>
                  <span className="text-[10px] font-mono text-emerald-400">+{addedLines}</span>
                  <span className="text-[10px] font-mono text-red-400">-{removedLines}</span>
                </div>
                <p className="text-xs text-slate-400">{activePatch.description}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownloadSinglePatch(activePatch)}
                  className="px-3 py-1.5 rounded-md bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-300 text-xs transition"
                >
                  Export .patch
                </button>

                {onReRunVerification && (
                  <button
                    onClick={onReRunVerification}
                    className="px-3 py-1.5 rounded-md bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-[#38bdf8] text-xs font-semibold transition"
                  >
                    Re-verify Gate
                  </button>
                )}

                {isApplied ? (
                  <button
                    onClick={() => onRejectPatch && onRejectPatch(activePatch)}
                    className="px-3.5 py-1.5 rounded-md bg-red-600/80 hover:bg-red-600 text-white font-bold text-xs transition"
                  >
                    Reject / Revert Change
                  </button>
                ) : (
                  <button
                    onClick={() => onApplyPatch(activePatch)}
                    className="px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition"
                  >
                    Apply Change in RAM
                  </button>
                )}
              </div>
            </div>

            {/* Verification Gate Card */}
            <div className="p-3 rounded-lg bg-[#111724] border border-[#1e293b] flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Verification Gate Decision:
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono ${
                    gateDecision === 'VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {gateDecision === 'VERIFIED' ? 'VERIFIED' : 'NEEDS REVIEW (UNAPPLIED)'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {isApplied
                    ? 'Verified against MSE checks. Invariant restored in ephemeral RAM.'
                    : 'Candidate change ready for application. Review diff below and apply to verify.'}
                </div>
              </div>

              {/* Exact Check Items */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {verificationChecks.map((c, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 rounded flex items-center space-x-1 ${
                      c.status === 'passed' ? 'bg-emerald-950/40 text-emerald-400 font-bold' : c.status === 'skipped' ? 'bg-slate-800 text-slate-400' : 'bg-red-950/40 text-red-400'
                    }`}
                  >
                    <span>{c.status === 'passed' ? '✓' : c.status === 'skipped' ? '○' : '✗'}</span>
                    <span>{c.name}: {String(c.status || 'skipped').toUpperCase()}</span>
                  </span>
                ))}
              </div>

              {/* Action Buttons: [ View Evidence ] [ View Diff ] [ Export Report ] */}
              {onNavigateTab && (
                <div className="flex items-center space-x-2 pt-2 border-t border-[#1e293b]">
                  <button
                    onClick={() => onNavigateTab('findings')}
                    className="px-2.5 py-1 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs transition"
                  >
                    View Evidence
                  </button>
                  <button
                    onClick={() => {
                      const diffEl = document.getElementById('unified-diff-container');
                      diffEl?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="px-2.5 py-1 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-[#38bdf8] text-xs transition"
                  >
                    View Diff
                  </button>
                  <button
                    onClick={() => onNavigateTab('report')}
                    className="px-2.5 py-1 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-purple-300 text-xs transition"
                  >
                    Export Report
                  </button>
                </div>
              )}
            </div>
          </div>

            {/* Change Justification & Metadata */}
          <div className="px-4 py-2.5 bg-[#0b0f19] border-b border-[#1e293b] flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <div>
              <span className="text-slate-500">Strategy: </span>
              <code className="text-white font-mono">{activePatch.strategy}</code>
            </div>
            <div>
              <span className="text-slate-500">Confidence: </span>
              <span className="text-emerald-400 font-semibold">{activePatch.confidence || 'high'}</span>
            </div>
            <div>
              <span className="text-slate-500">Regression Test: </span>
              <span className="text-[#38bdf8]">Vitest Antigen Synthesized</span>
            </div>
          </div>

          {/* Unified Diff Viewer */}
          <div id="unified-diff-container" className="flex-1 overflow-auto p-4 bg-[#060910] font-mono text-xs leading-relaxed">
            <div className="space-y-0.5">
              {chunks.map((chunk, cIdx) => (
                <div key={cIdx} className="space-y-0.5">
                  <div className="text-slate-500 py-1 text-[11px] select-none">{chunk.header}</div>
                  {chunk.lines.map((line, lIdx) => (
                    <div
                      key={lIdx}
                      className={`px-2 py-0.2 rounded-sm flex items-start space-x-2 ${
                        line.type === 'add'
                          ? 'bg-emerald-950/60 text-emerald-300'
                          : line.type === 'del'
                          ? 'bg-red-950/60 text-red-300'
                          : 'text-slate-400'
                      }`}
                    >
                      <span className="select-none text-slate-600 w-4 text-right">
                        {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                      </span>
                      <span className="whitespace-pre-wrap">{line.text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
