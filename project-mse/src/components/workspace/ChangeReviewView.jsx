import React, { useState, useMemo } from 'react';
import { generateUnifiedDiff, parseUnifiedDiff } from '../../utils/diffUtils';
import { downloadFile, downloadPatches } from '../../utils/downloadUtils';

/**
 * ChangeReviewView
 *
 * Displays both Manual in-memory edits and MSE-synthesized patches.
 * Shows status (VERIFIED, UNVERIFIED, APPLIED, PENDING, REVERTED) for every change.
 * Links applied patches to their originating finding.
 * Compares real baseline content vs current working content.
 */
export default function ChangeReviewView({
  patches,
  appliedPatchIds = [],
  appliedPatchRecords = [],
  manualChanges = [],
  onApplyPatch,
  onApplyAllPatches,
  onRejectPatch,
  onRevertPatch,
  onRevertFile,
  onResetRepository,
  onOpenInEditor,
  onReRunVerification,
  onTestChanges,
  onSelectFinding,
  findings = [],
  snapshot,
  baselineSnapshot,
  targetFile,
  repoName = 'repository',
  onNavigateTab,
  verification,
  decision,
  testResult,
  workingRevisionId,
  baselineRevisionId,
  isWorkingRevisionVerified = false
}) {
  const patchList = patches?.patches || [];

  // Build unified changes list with real diffs and finding linkage
  const allItems = useMemo(() => {
    const items = [];
    const processedFiles = new Set();

    // 1. Files modified in working snapshot (Real diff baseline vs working)
    if (snapshot?.files && baselineSnapshot?.files) {
      for (const workingFile of snapshot.files) {
        const baseFile = baselineSnapshot.files.find(f => f.path === workingFile.path);
        if (!baseFile || baseFile.content === workingFile.content) continue;

        processedFiles.add(workingFile.path);

        const realDiff = generateUnifiedDiff(workingFile.path, baseFile.content, workingFile.content);
        const appliedRecordsForFile = appliedPatchRecords.filter(
          p => p.filePath === workingFile.path && p.status === 'applied'
        );
        const hasManual = manualChanges.some(
          m => m.filePath === workingFile.path && (m.source === 'manual' || m.source === 'mse_patch_and_manual')
        );

        let kind = 'MANUAL';
        let description = `Manual in-memory modification in ${workingFile.path}`;
        if (appliedRecordsForFile.length > 0 && hasManual) {
          kind = 'BOTH';
          description = `MSE Patch + Manual Edit combined in ${workingFile.path}`;
        } else if (appliedRecordsForFile.length > 0) {
          kind = 'MSE';
          description = `MSE Patch applied to ${workingFile.path}: ${appliedRecordsForFile[0].description}`;
        }

        // Find originating finding
        const matchingFinding = findings.find(f =>
          f.file === workingFile.path ||
          f.patch?.targetFile === workingFile.path ||
          appliedRecordsForFile.some(p => p.patchId === f.patch?.id || p.findingId === f.id)
        );

        items.push({
          id: `working-${workingFile.path}`,
          type: kind === 'MSE' ? 'patch' : kind === 'BOTH' ? 'both' : 'manual',
          targetFile: workingFile.path,
          kind,
          description,
          diff: realDiff,
          isApplied: appliedRecordsForFile.length > 0,
          isVerified: isWorkingRevisionVerified && Boolean(matchingFinding?.isRepaired),
          status: (isWorkingRevisionVerified && matchingFinding?.isRepaired) ? 'verified' : 'modified',
          originatingFinding: matchingFinding || null,
          rawPatch: appliedRecordsForFile[0] ? (patchList.find(p => p.id === appliedRecordsForFile[0].patchId) || appliedRecordsForFile[0]) : null,
          appliedRecords: appliedRecordsForFile
        });
      }
    }

    // 2. Candidate unapplied MSE patches
    for (const p of patchList) {
      if (appliedPatchIds.includes(p.id)) continue; // already reflected above

      const matchingFinding = findings.find(f => f.patch?.id === p.id || f.file === p.targetFile);
      items.push({
        id: `candidate-${p.id}`,
        type: 'candidate_patch',
        targetFile: p.targetFile,
        kind: 'MSE',
        description: `Candidate MSE Repair: ${p.description}`,
        diff: p.diff,
        strategy: p.strategy,
        isApplied: false,
        isVerified: false,
        status: 'candidate',
        originatingFinding: matchingFinding || null,
        rawPatch: p
      });
    }

    // 3. Explicitly Reverted Patches
    for (const rec of appliedPatchRecords) {
      if (rec.status === 'reverted' && !items.some(i => i.id === `reverted-${rec.patchId}`)) {
        const matchingFinding = findings.find(f => f.patch?.id === rec.patchId || f.id === rec.findingId);
        items.push({
          id: `reverted-${rec.patchId}`,
          type: 'reverted_patch',
          targetFile: rec.filePath,
          kind: 'MSE',
          description: `Reverted MSE Repair: ${rec.description}`,
          diff: rec.diff,
          strategy: rec.strategy,
          isApplied: false,
          isVerified: false,
          status: 'reverted',
          originatingFinding: matchingFinding || null,
          rawPatch: patchList.find(p => p.id === rec.patchId) || rec
        });
      }
    }

    return items;
  }, [snapshot, baselineSnapshot, appliedPatchRecords, appliedPatchIds, manualChanges, findings, patchList, isWorkingRevisionVerified]);

  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'MANUAL' | 'PATCHES' | 'REVERTED'
  
  const initialSelected = targetFile
    ? allItems.find(item => item.targetFile === targetFile)?.id || allItems[0]?.id
    : allItems[0]?.id;

  const [selectedItemId, setSelectedItemId] = useState(initialSelected || null);

  const filteredItems = allItems.filter(item => {
    if (filterType === 'MANUAL') return item.kind === 'MANUAL' || item.kind === 'BOTH';
    if (filterType === 'PATCHES') return item.kind === 'MSE' || item.kind === 'BOTH';
    if (filterType === 'REVERTED') return item.status === 'reverted';
    return true;
  });

  const activeItem = allItems.find(item => item.id === selectedItemId) || filteredItems[0] || allItems[0];

  const chunks = activeItem?.diff ? parseUnifiedDiff(activeItem.diff) : [];

  // Count lines added / removed
  let addedLines = 0;
  let removedLines = 0;
  for (const chunk of chunks) {
    for (const line of chunk.lines) {
      if (line.type === 'add') addedLines++;
      if (line.type === 'del') removedLines++;
    }
  }

  const handleDownloadSingleDiff = (item) => {
    if (!item?.diff) return;
    const filename = `${item.id}-${item.targetFile.replace(/[/\\]/g, '_')}.patch`;
    downloadFile(filename, item.diff, 'text/x-diff');
  };

  const totalModifiedFiles = new Set(allItems.filter(i => i.status !== 'candidate' && i.status !== 'reverted').map(i => i.targetFile)).size;

  if (allItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center font-sans bg-[#090d16] text-slate-400 space-y-3">
        <span className="text-3xl">✨</span>
        <h3 className="text-sm font-bold text-slate-200">No Fixes to Review</h3>
        <p className="text-xs max-w-md text-slate-500">
          The codebase matches the baseline and satisfies all bound invariants. No manual edits or repair patches are active.
        </p>
        <button
          onClick={() => onNavigateTab?.('source')}
          className="px-3.5 py-1.5 rounded bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-[#38bdf8] text-xs font-semibold"
        >
          Open Source Editor
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden font-sans text-xs bg-[#090d16] text-slate-200">
      
      {/* 1. Left Sidebar: Changes Explorer */}
      <div className="w-80 border-r border-[#263147] bg-[#0d131f] flex flex-col shrink-0 select-none">
        
        {/* Header & Filter Tabs */}
        <div className="p-3 border-b border-[#263147] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Changes ({allItems.length})
            </span>
            <span className="text-[10px] font-mono text-[#38bdf8]">
              {totalModifiedFiles} file{totalModifiedFiles === 1 ? '' : 's'} modified
            </span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1 bg-[#111724] border border-[#263147] rounded p-0.5 text-[10px]">
            <button
              onClick={() => setFilterType('ALL')}
              className={`flex-1 py-1 rounded transition text-center font-medium ${
                filterType === 'ALL'
                  ? 'bg-[#1e293b] text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({allItems.length})
            </button>
            <button
              onClick={() => setFilterType('PATCHES')}
              className={`flex-1 py-1 rounded transition text-center font-medium ${
                filterType === 'PATCHES'
                  ? 'bg-[#1e293b] text-emerald-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              MSE
            </button>
            <button
              onClick={() => setFilterType('MANUAL')}
              className={`flex-1 py-1 rounded transition text-center font-medium ${
                filterType === 'MANUAL'
                  ? 'bg-[#1e293b] text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setFilterType('REVERTED')}
              className={`flex-1 py-1 rounded transition text-center font-medium ${
                filterType === 'REVERTED'
                  ? 'bg-[#1e293b] text-red-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Reverted
            </button>
          </div>
        </div>
        {/* Change Items List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filteredItems.map((item) => {
            const isSelected = activeItem?.id === item.id;
            const isManual = item.kind === 'MANUAL';
            const isBoth = item.kind === 'BOTH';
            const isMse = item.kind === 'MSE';

            return (
              <div
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                className={`p-3 rounded-lg cursor-pointer border transition ${
                  isSelected
                    ? 'bg-[#1e293b] border-[#38bdf8] text-white shadow-sm'
                    : 'bg-[#111724] border-[#263147] hover:border-slate-500 text-slate-300'
                }`}
              >
                {/* Top Row: File & Category */}
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-semibold text-slate-200 truncate max-w-[150px]" title={item.targetFile}>
                    {item.targetFile}
                  </span>

                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase border ${
                    isBoth
                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                      : isMse
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}>
                    {isBoth ? 'MSE + Manual' : isMse ? 'MSE patch' : 'Manual edit'}
                  </span>
                </div>

                {/* Subtitle: Description */}
                <div className="text-[11px] text-slate-400 line-clamp-1 mb-1">
                  {item.description}
                </div>

                {/* Originating Finding Link (Requirement 16) */}
                {item.originatingFinding && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectFinding?.(item.originatingFinding);
                    }}
                    className="text-[10px] text-[#38bdf8] hover:underline font-mono truncate mb-1.5 flex items-center space-x-1"
                    title={`Go to finding: ${item.originatingFinding.title}`}
                  >
                    <span>📍</span>
                    <span>{item.originatingFinding.title}</span>
                  </div>
                )}

                {/* Bottom Row: Verification Status */}
                <div className="flex items-center justify-between text-[10px] font-mono border-t border-[#1e293b] pt-1.5">
                  <span className={item.isVerified ? 'text-emerald-400 font-bold flex items-center space-x-1' : item.status === 'candidate' ? 'text-slate-400' : item.status === 'reverted' ? 'text-red-400' : 'text-amber-400 font-medium'}>
                    <span>{item.isVerified ? '✓ VERIFIED' : item.status === 'candidate' ? 'CANDIDATE' : item.status === 'reverted' ? 'REVERTED' : 'MODIFIED · NOT VERIFIED'}</span>
                  </span>

                  {item.strategy && (
                    <span className="text-slate-500 uppercase">{item.strategy}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Global Batch Controls */}
        <div className="p-3 border-t border-[#263147] bg-[#090d16] space-y-2">
          {/* Test All Changes */}
          <button
            onClick={onTestChanges || onReRunVerification}
            className="w-full py-2 bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-bold rounded-md text-xs shadow-sm transition flex items-center justify-center space-x-1"
          >
            <span>Test All Changes</span>
          </button>

          {/* Apply All MSE Patches */}
          {patchList.length > 0 && (
            <button
              onClick={onApplyAllPatches}
              disabled={patchList.every(p => appliedPatchIds.includes(p.id))}
              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-md text-xs transition"
            >
              Apply All MSE Fixes
            </button>
          )}

          {/* Reset Repository (Requirement 10) */}
          {onResetRepository && (
            <button
              onClick={onResetRepository}
              className="w-full py-1.5 bg-[#162032] hover:bg-[#1e293b] border border-red-500/30 text-red-300 hover:text-white text-xs rounded-md transition font-medium"
              title="Revert all manual edits and applied patches back to baseline original"
            >
              Reset Repository
            </button>
          )}

          {/* Export Patches */}
          <button
            onClick={() => downloadPatches(patchList, repoName)}
            className="w-full py-1.5 bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-400 hover:text-white text-[11px] rounded-md transition"
          >
            Export All (.patch)
          </button>
        </div>

      </div>

      {/* 2. Main Review & Diff Area */}
      {activeItem ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Header Bar */}
          <div className="p-4 border-b border-[#263147] bg-[#0d131f] space-y-3 shrink-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                    activeItem.kind === 'BOTH'
                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                      : activeItem.kind === 'MSE'
                      ? 'bg-blue-500/10 text-[#38bdf8] border-blue-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}>
                    {activeItem.kind === 'BOTH' ? 'MSE PATCH + MANUAL EDIT' : activeItem.kind === 'MSE' ? 'MSE REPAIR PATCH' : 'MANUAL EDIT'}
                  </span>

                  <h2 className="text-sm font-bold text-white font-mono">{activeItem.targetFile}</h2>
                  <span className="text-[10px] font-mono text-emerald-400">+{addedLines}</span>
                  <span className="text-[10px] font-mono text-red-400">-{removedLines}</span>
                </div>
                <p className="text-xs text-slate-400">{activeItem.description}</p>
              </div>

              {/* Action Buttons for Active Item */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Open in Editor */}
                <button
                  onClick={() => onOpenInEditor?.(activeItem.targetFile)}
                  className="px-3 py-1.5 rounded bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-[#38bdf8] font-bold text-xs transition"
                >
                  Open in Editor
                </button>

                {/* MSE Patch: Apply / Revert (Requirements 5 & 9) */}
                {activeItem.rawPatch && (
                  activeItem.isApplied ? (
                    <button
                      onClick={() => (onRevertPatch || onRejectPatch)?.(activeItem.rawPatch)}
                      className="px-3 py-1.5 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-300 text-xs font-bold transition"
                    >
                      Revert Patch
                    </button>
                  ) : activeItem.status !== 'reverted' ? (
                    <button
                      onClick={() => onApplyPatch?.(activeItem.rawPatch)}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition"
                    >
                      Apply Fix
                    </button>
                  ) : null
                )}

                {/* Manual Edit: Revert File */}
                {activeItem.status !== 'candidate' && activeItem.status !== 'reverted' && onRevertFile && (
                  <button
                    onClick={() => onRevertFile(activeItem.targetFile)}
                    className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-slate-700 text-slate-300 text-xs font-semibold transition"
                    title="Revert entire file to baseline repository original"
                  >
                    Revert File
                  </button>
                )}

                {/* Download diff */}
                <button
                  onClick={() => handleDownloadSingleDiff(activeItem)}
                  className="px-2.5 py-1.5 rounded bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-300 text-xs transition font-mono"
                  title="Download unified diff file"
                >
                  Export .patch
                </button>
              </div>
            </div>

            {/* Originating Finding Banner (Requirement 16) */}
            {activeItem.originatingFinding && (
              <div className="bg-[#111724] border border-[#1e293b] rounded p-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="text-[#38bdf8] font-bold font-mono">[ORIGINATING FINDING]</span>
                  <span className="text-white font-medium">{activeItem.originatingFinding.title}</span>
                  <span className="text-slate-400 font-mono text-[11px]">({activeItem.originatingFinding.id})</span>
                </div>
                <button
                  onClick={() => onSelectFinding?.(activeItem.originatingFinding)}
                  className="text-xs text-[#38bdf8] hover:underline font-semibold flex items-center space-x-1"
                >
                  <span>View Finding Context</span>
                  <span>&rarr;</span>
                </button>
              </div>
            )}
          </div>

          {/* Diff Content View */}
          <div className="flex-1 overflow-auto p-4 font-mono text-xs bg-[#090d16] space-y-3">
            {chunks.length === 0 ? (
              <div className="py-12 text-center text-slate-500 italic">
                No differences between baseline and in-memory version.
              </div>
            ) : (
              chunks.map((chunk, cIdx) => (
                <div key={cIdx} className="border border-[#1e293b] rounded-lg overflow-hidden bg-[#0d131f]">
                  <div className="bg-[#111724] px-3 py-1 text-[11px] text-slate-500 font-bold border-b border-[#1e293b]">
                    {chunk.header}
                  </div>
                  {chunk.lines.map((line, lIdx) => {
                    const isAdd = line.type === 'add';
                    const isDel = line.type === 'remove';
                    return (
                      <div
                        key={lIdx}
                        className={`flex items-start px-2 py-0.5 leading-5 ${
                          isAdd
                            ? 'bg-emerald-950/40 text-emerald-300'
                            : isDel
                            ? 'bg-red-950/40 text-red-300'
                            : 'text-slate-400'
                        }`}
                      >
                        <span className="w-10 text-right pr-2 select-none text-[10px] text-slate-600">
                          {line.oldNum || ''}
                        </span>
                        <span className="w-10 text-right pr-2 select-none text-[10px] text-slate-600">
                          {line.newNum || ''}
                        </span>
                        <span className="w-4 select-none font-bold">
                          {isAdd ? '+' : isDel ? '-' : ' '}
                        </span>
                        <span className="flex-1 whitespace-pre overflow-x-auto">
                          {line.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8 text-slate-500 font-mono text-xs">
          Select a change to inspect its unified diff.
        </div>
      )}

    </div>
  );
}
