import React, { useRef, useEffect, useState, useMemo } from 'react';
import { generateUnifiedDiff, parseUnifiedDiff } from '../../utils/diffUtils';
import { getFileModificationState } from '../../engine/patchLifecycle.js';

/**
 * SourceView: Interactive REPAIR + TEST Workspace
 *
 * Supports:
 * - View mode (read-only with highlight jump)
 * - Edit mode (in-memory editor with line numbers, tab support, undo/redo)
 * - Diff mode (Original Baseline vs In-Memory Version)
 * - Save to RAM (updates in-memory RepositorySnapshot, zero disk write)
 * - Test Changes (triggers real MSE pipeline verification against edited snapshot)
 * - Finding-aware contextual editing (jumps to affected line, shows finding context)
 * - Compare with MSE patch (Current Manual Edit vs MSE Generated Repair)
 * - Revert file to baseline
 */
export default function SourceView({
  file,
  baselineFile,
  highlightLine,
  selectedEvidence,
  activeFinding,
  candidatePatch,
  openTabs = [],
  onSelectTab,
  onCloseTab,
  onSaveFile,
  onRevertFile,
  onTestChanges,
  onApplyMsePatch,
  onRevertPatch,
  appliedPatches = [],
  manualEdits = {},
  workingRevisionId,
  baselineRevisionId,
  testedRevisionId,
  isWorkingRevisionVerified = false,
  testResult,
  verificationTarget,
  verificationHistory = [],
  modification,
  isRunning = false,
  onOpenDiff: _onOpenDiff,
  onNavigateToCounterexample: _onNavigateToCounterexample
}) {
  const lineRef = useRef(null);
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  const [viewMode, setViewMode] = useState('view'); // 'view' | 'edit' | 'diff'
  const [editBuffer, setEditBuffer] = useState(() => file?.content ?? '');
  const [prevFile, setPrevFile] = useState(file);
  const [copied, setCopied] = useState(false);
  const [showPatchModal, setShowPatchModal] = useState(false);
  const [showTestDrawer, setShowTestDrawer] = useState(true);

  // Sync buffer when active file changes without useEffect setState
  if (file !== prevFile) {
    setPrevFile(file);
    setEditBuffer(file?.content ?? '');
  }

  // Scroll to highlighted line in view mode
  useEffect(() => {
    if (highlightLine && lineRef.current && viewMode === 'view') {
      lineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightLine, file?.path, viewMode]);

  // Synchronize textarea scrolling with line numbers column
  const handleScroll = (e) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
  };

  // Keyboard enhancements for textarea: Tab indent & Save shortcut
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const val = e.target.value;
      const newVal = val.substring(0, start) + '  ' + val.substring(end);
      setEditBuffer(newVal);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  // State calculations
  const baselineContent = baselineFile?.content ?? file?.content ?? '';
  const currentSavedContent = file?.content ?? '';
  const isUnsaved = editBuffer !== currentSavedContent;
  const isModifiedFromBaseline = currentSavedContent !== baselineContent;

  // Modification State & Lifecycle Tracking (Requirements 7 & 8)
  const fileModState = useMemo(() => {
    return getFileModificationState({
      filePath: file?.path,
      baselineContent,
      workingContent: currentSavedContent,
      appliedPatches,
      manualEdits
    });
  }, [file?.path, baselineContent, currentSavedContent, appliedPatches, manualEdits]);

  const handleSave = () => {
    if (!file || !onSaveFile) return;
    onSaveFile(file.path, editBuffer);
  };

  const handleCancelEdit = () => {
    setEditBuffer(file?.content ?? '');
    setViewMode('view');
  };

  const handleRevert = () => {
    if (!file || !onRevertFile) return;
    onRevertFile(file.path);
    setEditBuffer(baselineContent);
    setViewMode('view');
  };

  const handleCopy = () => {
    if (!file) return;
    const textToCopy = viewMode === 'edit' ? editBuffer : (file.content || '');
    navigator.clipboard?.writeText?.(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Diff calculation: Baseline Original vs Working Content
  const diffString = useMemo(() => {
    if (!file) return '';
    return generateUnifiedDiff(file.path, baselineContent, viewMode === 'edit' ? editBuffer : currentSavedContent);
  }, [file, baselineContent, currentSavedContent, editBuffer, viewMode]);

  const diffChunks = useMemo(() => {
    return parseUnifiedDiff(diffString);
  }, [diffString]);

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#090d16] text-slate-500 font-mono text-xs space-y-2 p-6">
        <span className="text-xl">📄</span>
        <p>Select a file from the repository explorer or a finding to inspect and edit source code.</p>
      </div>
    );
  }

  const lines = (file.content ?? '').split('\n');
  const bufferLines = editBuffer.split('\n');

  return (
    <div className="flex-1 flex flex-col bg-[#090d16] overflow-hidden font-sans">
      
      {/* 1. Tab Bar & Primary File Controls */}
      <div className="bg-[#0d131f] border-b border-[#263147] flex items-center justify-between px-2 overflow-x-auto shrink-0 select-none">
        <div className="flex items-center space-x-0.5">
          {openTabs.map(tabPath => {
            const isTabActive = tabPath === file.path;
            const tabName = tabPath.split('/').pop();
            const isTabUnsaved = tabPath === file.path && isUnsaved;

            return (
              <div
                key={tabPath}
                onClick={() => onSelectTab(tabPath)}
                className={`group px-3 py-1.5 text-xs font-mono flex items-center space-x-2 border-r border-[#263147] cursor-pointer ${
                  isTabActive
                    ? 'bg-[#090d16] text-slate-100 border-t-2 border-t-[#38bdf8] font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
                }`}
              >
                <span>{tabName}</span>
                {isTabUnsaved && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" title="Unsaved changes" />
                )}
                {openTabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tabPath);
                    }}
                    className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 text-slate-500 text-[10px]"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Status Badge & Actions (Requirements 7 & 11) */}
        <div className="flex items-center space-x-2 py-1.5 pr-2">
          {/* Status always reflects the working snapshot, never a saved textarea alone */}
          {isUnsaved ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
              UNSAVED
            </span>
          ) : fileModState.state !== 'UNMODIFIED' ? (
            <>
              {/* Explicit State Marker: MSE PATCH APPLIED / MSE PATCH APPLIED + MANUAL MODIFICATION / MANUAL MODIFICATION */}
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                fileModState.hasPatch && fileModState.hasManual
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : fileModState.hasPatch
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
              }`}>
                {fileModState.label}
              </span>

              {/* Revision Verification Badge: VERIFIED vs MODIFIED — NOT VERIFIED */}
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                isWorkingRevisionVerified
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}>
                {isWorkingRevisionVerified ? 'VERIFIED' : 'MODIFIED — NOT VERIFIED'}
              </span>

              {workingRevisionId && (
                <span className="hidden xl:inline-block px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#111724] border border-[#263147] text-slate-400">
                  {workingRevisionId}
                </span>
              )}
            </>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-500 border border-[#263147]">
              UNMODIFIED
            </span>
          )}

          {/* Mode Switcher: [ View ] [ Edit ] [ Diff ] */}
          <div className="flex items-center bg-[#111724] border border-[#263147] rounded p-0.5 text-[11px] font-mono">
            <button
              onClick={() => setViewMode('view')}
              className={`px-2.5 py-0.5 rounded transition ${
                viewMode === 'view'
                  ? 'bg-[#1e293b] text-[#38bdf8] font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              View
            </button>
            <button
              onClick={() => setViewMode('edit')}
              className={`px-2.5 py-0.5 rounded transition ${
                viewMode === 'edit'
                  ? 'bg-[#1e293b] text-[#38bdf8] font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setViewMode('diff')}
              className={`px-2.5 py-0.5 rounded transition ${
                viewMode === 'diff'
                  ? 'bg-[#1e293b] text-[#38bdf8] font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Diff
            </button>
          </div>

          {/* Save / Cancel Action */}
          {isUnsaved && (
            <div className="flex items-center space-x-1">
              <button
                onClick={handleSave}
                disabled={isRunning}
                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-[#090d16] font-bold text-xs shadow-sm transition disabled:opacity-50"
                title="Save changes to ephemeral RAM snapshot"
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={isRunning}
                className="px-2 py-1 rounded bg-[#162032] hover:bg-[#1e293b] border border-slate-700 text-slate-300 text-xs font-medium transition"
                title="Discard unsaved edits"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Test Changes Button */}
          <button
            onClick={onTestChanges}
            disabled={isRunning}
            className="px-3 py-1 rounded bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-bold text-xs shadow-sm transition flex items-center space-x-1.5 disabled:opacity-50"
            title="Run MSE verification pipeline against current RAM snapshot"
          >
            {isRunning ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[#090d16] animate-ping" />
                <span>Checking...</span>
              </>
            ) : (
              <span>Test Changes</span>
            )}
          </button>

          {/* Revert File Button */}
          {(isModifiedFromBaseline || isUnsaved) && (
            <button
              onClick={handleRevert}
              disabled={isRunning}
              className="px-2.5 py-1 rounded bg-[#162032] hover:bg-[#1e293b] border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-medium transition disabled:opacity-50"
              title="Revert file to initial baseline content"
            >
              Revert
            </button>
          )}

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="px-2 py-1 rounded text-xs font-mono border border-[#263147] text-slate-400 hover:text-slate-200 hover:bg-[#111724]"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* 2. Transformation History Breadcrumb (Requirement 8) */}
      {fileModState.state !== 'UNMODIFIED' && (
        <div className="bg-[#0b101b] border-b border-[#1e293b] px-4 py-1.5 flex items-center space-x-2 text-[11px] font-mono text-slate-400 overflow-x-auto">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">History:</span>
          {fileModState.history.map((step, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="text-slate-600">→</span>}
              <span className={idx === fileModState.history.length - 1 ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
                {step}
              </span>
            </React.Fragment>
          ))}
          <span className="text-slate-600">→</span>
          <span className={isWorkingRevisionVerified ? 'text-emerald-400 font-bold' : 'text-amber-300'}>
            {isWorkingRevisionVerified ? 'Tested & Verified' : 'Current Working State (Unverified)'}
          </span>
        </div>
      )}

      {/* 3. Finding-Aware Context Banner */}
      {(activeFinding || selectedEvidence) && (
        <div className="bg-[#111c2e] border-b border-[#24334d] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-[#38bdf8] font-bold font-mono">[FINDING]</span>
            <span className="font-semibold text-white">
              {activeFinding?.title || selectedEvidence?.title || 'Selected Invariant Issue'}
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              ({file.path}:{highlightLine || activeFinding?.line || 1})
            </span>
          </div>

          {verificationTarget && (
            <div className="w-full text-[11px] text-slate-400">
              Testing target {verificationTarget.findingId}
              {verificationTarget.invariantId ? ` · invariant ${verificationTarget.invariantId}` : ''}
              {verificationTarget.counterexampleId ? ` · counterexample ${verificationTarget.counterexampleId}` : ''}
            </div>
          )}

          <div className="flex items-center space-x-2 font-mono text-[11px]">
            {candidatePatch && (
              <button
                onClick={() => setShowPatchModal(true)}
                className="px-2.5 py-1 rounded bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-[#38bdf8] font-bold transition"
              >
                Compare With MSE Patch
              </button>
            )}

            {viewMode !== 'edit' && (
              <button
                onClick={() => setViewMode('edit')}
                className="px-2.5 py-1 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-slate-200 transition"
              >
                Edit Source
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Main Workspace Area (View / Edit / Diff) */}
      <div className="flex-1 overflow-hidden flex flex-col relative">

        {/* A. EDIT MODE (Requirement 1) */}
        {viewMode === 'edit' && (
          <div className="flex-1 flex overflow-hidden font-mono text-xs bg-[#090d16]">
            {/* Synchronized Line Numbers */}
            <div
              ref={lineNumbersRef}
              className="w-12 bg-[#0d131f] border-r border-[#1e293b] py-2 px-1 text-right text-slate-600 select-none overflow-hidden"
              style={{ lineHeight: '20px' }}
            >
              {bufferLines.map((_, i) => (
                <div key={i} className="h-5">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Editable Textarea */}
            <textarea
              ref={textareaRef}
              value={editBuffer}
              onChange={(e) => setEditBuffer(e.target.value)}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck="false"
              className="flex-1 bg-[#090d16] text-slate-100 p-2 font-mono text-xs resize-none outline-none leading-5 overflow-auto selection:bg-[#1e3a5f]"
              style={{ lineHeight: '20px', tabSize: 2 }}
              placeholder="Edit source in ephemeral RAM..."
            />
          </div>
        )}

        {/* B. VIEW MODE (Read-Only) */}
        {viewMode === 'view' && (
          <div className="flex-1 overflow-auto flex flex-col font-mono text-xs p-2">
            <div className="space-y-0.5">
              {lines.map((codeLine, idx) => {
                const lineNum = idx + 1;
                const isTarget = highlightLine === lineNum;

                return (
                  <div
                    key={idx}
                    ref={isTarget ? lineRef : null}
                    className={`flex items-center transition-colors ${
                      isTarget
                        ? 'bg-[#1b2b45] text-slate-100 font-bold border-l-2 border-l-[#38bdf8]'
                        : 'hover:bg-[#111724] text-slate-300'
                    }`}
                  >
                    <span 
                      className={`w-10 text-right pr-2 py-0.5 select-none text-[10px] ${
                        isTarget 
                          ? 'text-[#38bdf8] font-bold' 
                          : 'text-slate-600'
                      }`}
                    >
                      {lineNum}
                    </span>

                    <span className="w-3 flex items-center justify-center shrink-0 text-[10px] text-[#38bdf8]">
                      {isTarget ? '>' : ''}
                    </span>

                    <span className="flex-1 whitespace-pre py-0.5 pr-2 overflow-x-auto">
                      {codeLine}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* C. DIFF MODE (Requirement 3: Original vs Edited) */}
        {viewMode === 'diff' && (
          <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-4 bg-[#090d16]">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-2 text-[11px] text-slate-400">
              <span className="font-bold text-white">Diff: Baseline Original vs In-Memory Version</span>
              <div className="flex items-center space-x-4">
                <span className="text-red-400">- Original Baseline</span>
                <span className="text-emerald-400">+ Current In-Memory RAM</span>
              </div>
            </div>

            {diffChunks.length === 0 ? (
              <div className="py-12 text-center text-slate-500 italic">
                No differences detected. File is identical to baseline original.
              </div>
            ) : (
              <div className="border border-[#1e293b] rounded-lg overflow-hidden bg-[#0d131f]">
                {diffChunks.map((chunk, cIdx) => (
                  <div key={cIdx} className="border-b border-[#1e293b] last:border-b-0">
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
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* 4. Test Result Panel (Requirements 6 & 12) */}
      {testResult && (
        <div className="bg-[#0d131f] border-t border-[#263147] p-3 shrink-0 font-sans text-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded uppercase border ${
                testResult.status === 'VERIFIED'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : testResult.status === 'FAILED'
                  ? 'bg-red-500/20 text-red-400 border-red-500/40'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
              }`}>
                {testResult.status}
              </span>

              <span className="text-[11px] text-slate-400 font-mono">
                Working snapshot verification
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowTestDrawer(!showTestDrawer)}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                {showTestDrawer ? 'Hide Details ▲' : 'Show Details ▼'}
              </button>
            </div>
          </div>

          {showTestDrawer && (
            <div className="space-y-1.5 pt-1">
              {testResult.checks && testResult.checks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px]">
                  {testResult.checks.map((check, idx) => {
                    const passed = check.status === 'passed';
                    const skipped = check.status === 'skipped';
                    return (
                      <div key={idx} className="flex items-center space-x-1.5 bg-[#111724] px-2 py-1 rounded border border-[#1e293b]">
                        <span className={passed ? 'text-emerald-400 font-bold' : skipped ? 'text-amber-400 font-bold' : 'text-red-400 font-bold'}>
                          {passed ? '✓' : skipped ? '–' : '✗'}
                        </span>
                        <span className="text-slate-300 truncate" title={check.name}>
                          {check.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  No finding-specific checks were produced for this attempt.
                </p>
              )}
              {testResult.evidence?.length > 0 && (
                <p className="text-[11px] text-slate-400">Evidence from the working analysis is available in the finding details.</p>
              )}
              {verificationHistory.length > 0 && (
                <p className="text-[11px] text-slate-500">Attempt {verificationHistory.at(-1)?.attempt} of {verificationHistory.length}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. Compare with MSE Patch Modal (Requirement 9) */}
      {showPatchModal && candidatePatch && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d131f] border border-[#263147] rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl font-sans text-xs">
            <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Compare Manual Edit vs MSE Generated Repair</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  File: {file.path} | Patch: {candidatePatch.id} ({candidatePatch.strategy})
                </p>
              </div>
              <button
                onClick={() => setShowPatchModal(false)}
                className="text-slate-400 hover:text-white px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4 font-mono text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Current Manual Working Edit */}
                <div className="border border-[#1e293b] rounded-lg p-3 bg-[#090d16] space-y-2">
                  <div className="flex items-center justify-between text-[11px] border-b border-[#1e293b] pb-1.5">
                    <span className="text-[#38bdf8] font-bold">Your Working Edit</span>
                    <span className="text-slate-500">In RAM</span>
                  </div>
                  <pre className="text-slate-300 text-[11px] overflow-auto max-h-80 leading-5">
                    {editBuffer}
                  </pre>
                </div>

                {/* Right: MSE Patch Diff */}
                <div className="border border-[#1e293b] rounded-lg p-3 bg-[#090d16] space-y-2">
                  <div className="flex items-center justify-between text-[11px] border-b border-[#1e293b] pb-1.5">
                    <span className="text-emerald-400 font-bold">MSE Generated Patch</span>
                    <span className="text-slate-500 font-mono">{candidatePatch.id}</span>
                  </div>
                  <pre className="text-slate-300 text-[11px] overflow-auto max-h-80 leading-5 whitespace-pre">
                    {candidatePatch.diff}
                  </pre>
                </div>
              </div>
            </div>

            {/* Actions: [ Keep My Edit ] [ Use MSE Patch ] [ Cancel ] */}
            <div className="p-4 border-t border-[#1e293b] flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowPatchModal(false)}
                className="px-3 py-1.5 rounded bg-[#1e293b] hover:bg-[#334155] text-slate-300 font-medium text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowPatchModal(false)}
                className="px-3.5 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#38bdf8] text-[#38bdf8] font-bold text-xs transition"
              >
                Keep My Edit
              </button>
              <button
                onClick={() => {
                  if (onApplyMsePatch) {
                    onApplyMsePatch(candidatePatch);
                  }
                  setShowPatchModal(false);
                  setViewMode('view');
                }}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition"
              >
                Use MSE Patch
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
