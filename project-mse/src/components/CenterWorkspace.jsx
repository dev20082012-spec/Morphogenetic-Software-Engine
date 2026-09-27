import React from 'react';
import OverviewView from './workspace/OverviewView';
import FindingsView from './workspace/FindingsView';
import FindingDetailView from './workspace/FindingDetailView';
import ChangeReviewView from './workspace/ChangeReviewView';
import RunsView from './workspace/RunsView';
import VerificationView from './workspace/VerificationView';
import ReportView from './workspace/ReportView';
import SourceView from './workspace/SourceView';
import ErrorBoundary from './ErrorBoundary';

export default function CenterWorkspace({
  mode = 'overview',
  onModeChange,
  selectedFinding,
  onSelectFinding,
  findings = [],
  file,
  highlightLine,
  selectedEvidence,
  openTabs,
  onSelectTab,
  onCloseTab,
  pipelineResult,
  snapshot,
  status,
  onRunAudit,
  appliedPatchIds = [],
  onApplyPatch,
  onApplyAllPatches,
  onRejectPatch,
  onReRunVerification,
  onJumpToFile,
  targetDiffFile,
  onOpenDiff,
  onSelectRun,
  currentRunId
}) {
  const patches = pipelineResult?.patches;
  const verification = pipelineResult?.verification;
  const invariants = pipelineResult?.invariants;
  const report = pipelineResult?.report;

  const repoName = snapshot?.metadata?.name || 'repository';

  return (
    <div className="flex-1 flex flex-col bg-[#090d16] overflow-hidden">
      <ErrorBoundary onReset={() => onModeChange('overview')}>
        {/* OVERVIEW VIEW */}
        {mode === 'overview' && (
          <OverviewView
            pipelineResult={pipelineResult}
            snapshot={snapshot}
            status={status}
            onRunAudit={onRunAudit}
            onNavigateTab={onModeChange}
            onSelectFinding={onSelectFinding}
            findings={findings}
            appliedPatchIds={appliedPatchIds}
          />
        )}

        {/* FINDINGS LIST OR DETAIL VIEW */}
        {mode === 'findings' && (
          selectedFinding ? (
            <FindingDetailView
              finding={selectedFinding}
              onBack={() => onSelectFinding(null)}
              onJumpToSource={(filePath, line) => {
                onJumpToFile(filePath, line);
                onModeChange('source');
              }}
              onViewPatch={(filePath) => {
                onOpenDiff(filePath);
                onModeChange('changes');
              }}
              onApplyPatch={onApplyPatch}
              onVerifyFix={onReRunVerification}
              onNavigateTab={onModeChange}
            />
          ) : (
            <FindingsView
              findings={findings}
              onSelectFinding={onSelectFinding}
              onNavigateTab={onModeChange}
            />
          )
        )}

        {/* CHANGES / PATCH REVIEW VIEW */}
        {mode === 'changes' && (
          <ChangeReviewView
            patches={patches}
            appliedPatchIds={appliedPatchIds}
            onApplyPatch={onApplyPatch}
            onApplyAllPatches={onApplyAllPatches}
            onRejectPatch={onRejectPatch}
            onReRunVerification={onReRunVerification}
            targetFile={targetDiffFile}
            repoName={repoName}
            onNavigateTab={onModeChange}
          />
        )}

        {/* ANALYSIS SESSIONS / RUNS VIEW */}
        {mode === 'runs' && (
          <RunsView
            onSelectRun={(run) => {
              if (onSelectRun) onSelectRun(run);
              onModeChange('overview');
            }}
            currentRunId={currentRunId}
          />
        )}

        {/* VERIFICATION STATE VIEW */}
        {mode === 'verification' && (
          <VerificationView
            verification={verification}
            invariants={invariants}
            onReRunVerification={onReRunVerification}
            status={status}
            onNavigateTab={onModeChange}
            pipelineResult={pipelineResult}
            snapshot={snapshot}
          />
        )}

        {/* REPORT EXPORT VIEW */}
        {mode === 'report' && (
          <ReportView
            report={report}
            repoName={repoName}
          />
        )}

        {/* SOURCE CODE EXPLORER VIEW */}
        {mode === 'source' && (
          <SourceView
            file={file}
            highlightLine={highlightLine}
            selectedEvidence={selectedEvidence}
            openTabs={openTabs}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            hasPatch={patches?.patches?.some(p => p.targetFile === file?.path)}
            onOpenDiff={onOpenDiff}
            onNavigateToCounterexample={() => onModeChange('findings')}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}
