import React from 'react';
import OverviewView from './workspace/OverviewView';
import SourceView from './workspace/SourceView';
import DriftView from './workspace/DriftView';
import CounterexampleView from './workspace/CounterexampleView';
import PatchView from './workspace/PatchView';
import VerificationView from './workspace/VerificationView';
import ReportView from './workspace/ReportView';
import ErrorBoundary from './ErrorBoundary';

export default function CenterWorkspace({
  mode,
  onModeChange,
  file,
  highlightLine,
  selectedEvidence,
  openTabs,
  onSelectTab,
  onCloseTab,
  hasPatch,
  onOpenDiff,
  pipelineResult,
  snapshot,
  status,
  onRunAudit,
  appliedPatchIds,
  onApplyPatch,
  onApplyAllPatches,
  onReRunVerification,
  onJumpToFile,
  targetDiffFile
}) {
  const driftCount = pipelineResult?.drift?.stats?.driftFindingsCount ?? 0;
  const cxCount = pipelineResult?.counterexamples?.summary?.generated ?? 0;
  const patchCount = pipelineResult?.patches?.summary?.generated ?? 0;

  return (
    <div className="flex-1 flex flex-col bg-[#090d16] overflow-hidden border-r border-[#263147]">
      {/* Workspace Mode Bar */}
      <div className="bg-[#0b0f19] border-b border-[#263147] flex items-center justify-between px-2 shrink-0 select-none overflow-x-auto">
        <div className="flex items-center space-x-1 py-1">
          <button
            onClick={() => onModeChange('overview')}
            className={`px-3 py-1 rounded-sm text-xs font-mono transition flex items-center space-x-1.5 ${
              mode === 'overview'
                ? 'bg-[#1e293b] text-slate-100 font-bold border border-[#38bdf8]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
            }`}
          >
            <span>[1] OVERVIEW</span>
          </button>

          <button
            onClick={() => onModeChange('source')}
            className={`px-3 py-1 rounded-sm text-xs font-mono transition flex items-center space-x-1.5 ${
              mode === 'source'
                ? 'bg-[#1e293b] text-slate-100 font-bold border border-[#38bdf8]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
            }`}
          >
            <span>[2] SOURCE</span>
          </button>

          <button
            onClick={() => onModeChange('drift')}
            className={`px-3 py-1 rounded-sm text-xs font-mono transition flex items-center space-x-1.5 ${
              mode === 'drift'
                ? 'bg-[#291e0b] text-[#fbbf24] font-bold border border-[#78350f]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
            }`}
          >
            <span>[3] DRIFT</span>
            {driftCount > 0 && (
              <span className="text-[9px] px-1 rounded-sm bg-[#3d2c0e] text-[#fbbf24] font-bold">
                {driftCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onModeChange('counterexample')}
            className={`px-3 py-1 rounded-sm text-xs font-mono transition flex items-center space-x-1.5 ${
              mode === 'counterexample'
                ? 'bg-[#2a1215] text-[#f87171] font-bold border border-[#7f1d1d]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
            }`}
          >
            <span>[4] COUNTEREXAMPLE</span>
            {cxCount > 0 && (
              <span className="text-[9px] px-1 rounded-sm bg-[#4a181d] text-[#f87171] font-bold">
                {cxCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onModeChange('diff')}
            className={`px-3 py-1 rounded-sm text-xs font-mono transition flex items-center space-x-1.5 ${
              mode === 'diff'
                ? 'bg-[#13281c] text-[#4ade80] font-bold border border-[#166534]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
            }`}
          >
            <span>[5] PATCH DIFF</span>
            {patchCount > 0 && (
              <span className="text-[9px] px-1 rounded-sm bg-[#1c3e27] text-[#4ade80] font-bold">
                {patchCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onModeChange('verification')}
            className={`px-3 py-1 rounded-sm text-xs font-mono transition flex items-center space-x-1.5 ${
              mode === 'verification'
                ? 'bg-[#1e293b] text-slate-100 font-bold border border-[#38bdf8]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
            }`}
          >
            <span>[6] VERIFICATION</span>
          </button>

          <button
            onClick={() => onModeChange('report')}
            className={`px-3 py-1 rounded-sm text-xs font-mono transition flex items-center space-x-1.5 ${
              mode === 'report'
                ? 'bg-[#1e293b] text-slate-100 font-bold border border-[#38bdf8]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
            }`}
          >
            <span>[7] REPORT</span>
          </button>
        </div>
      </div>

      {/* Mode View Content wrapped in Error Boundary */}
      <div className="flex-1 flex overflow-hidden">
        <ErrorBoundary onReset={() => onModeChange('overview')}>
          {mode === 'overview' && (
            <OverviewView
              pipelineResult={pipelineResult}
              snapshot={snapshot}
              status={status}
              onRunAudit={onRunAudit}
              onNavigateMode={onModeChange}
            />
          )}

          {mode === 'source' && (
            <SourceView
              file={file}
              highlightLine={highlightLine}
              selectedEvidence={selectedEvidence}
              openTabs={openTabs}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              hasPatch={hasPatch}
              onOpenDiff={onOpenDiff}
              onNavigateToCounterexample={() => onModeChange('counterexample')}
            />
          )}

          {mode === 'drift' && (
            <DriftView
              drift={pipelineResult?.drift}
              onJumpToFile={onJumpToFile}
              onViewPatch={(filePath) => onOpenDiff(filePath)}
            />
          )}

          {mode === 'counterexample' && (
            <CounterexampleView
              counterexamples={pipelineResult?.counterexamples}
              onJumpToFile={onJumpToFile}
              onViewPatch={() => onModeChange('diff')}
            />
          )}

          {mode === 'diff' && (
            <PatchView
              patches={pipelineResult?.patches}
              appliedPatchIds={appliedPatchIds}
              onApplyPatch={onApplyPatch}
              onApplyAllPatches={onApplyAllPatches}
              onReRunVerification={onReRunVerification}
              targetFile={targetDiffFile}
            />
          )}

          {mode === 'verification' && (
            <VerificationView
              verification={pipelineResult?.verification}
              invariants={pipelineResult?.invariants}
              onReRunVerification={onReRunVerification}
              status={status}
            />
          )}

          {mode === 'report' && (
            <ReportView
              report={pipelineResult?.report}
              repoName={snapshot?.metadata?.name || 'repository'}
            />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
