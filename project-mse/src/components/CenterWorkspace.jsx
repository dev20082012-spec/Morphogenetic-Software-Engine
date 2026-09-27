import React from 'react';
import OverviewView from './workspace/OverviewView';
import FindingsView from './workspace/FindingsView';
import FindingDetailView from './workspace/FindingDetailView';
import ChangeReviewView from './workspace/ChangeReviewView';
import RunsView from './workspace/RunsView';
import VerificationView from './workspace/VerificationView';
import ReportView from './workspace/ReportView';
import SourceView from './workspace/SourceView';
import AnalysisProgressView from './workspace/AnalysisProgressView';
import AnalysisFailedView from './workspace/AnalysisFailedView';
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
  activeFinding,
  openTabs,
  onSelectTab,
  onCloseTab,
  pipelineResult,
  snapshot,
  baselineSnapshot,
  session,
  logs = [],
  onRunAudit,
  onChangeRepository,
  appliedPatchIds = [],
  appliedPatchRecords = [],
  manualEdits = {},
  manualChanges = [],
  workingRevisionId,
  baselineRevisionId,
  testedRevisionId,
  isWorkingRevisionVerified,
  onSaveFile,
  onRevertFile,
  onResetRepository,
  onTestChanges,
  testResult,
  verificationTarget,
  verificationHistory = [],
  modifications = {},
  onApplyPatch,
  onApplyAllPatches,
  onRejectPatch,
  onRevertPatch,
  onReRunVerification,
  onJumpToFile,
  targetDiffFile,
  onOpenDiff,
  onSelectRun,
  currentRunId,
  capabilities
}) {
  const sessionStatus = session?.status || 'IDLE';
  const repoName = session?.repository || snapshot?.metadata?.name || 'repository';
  const isRunning = sessionStatus !== 'IDLE' && sessionStatus !== 'COMPLETE' && sessionStatus !== 'FAILED';

  // 1. FAILED ANALYSIS STATE
  if (sessionStatus === 'FAILED') {
    return (
      <AnalysisFailedView
        error={session?.error}
        repositoryName={repoName}
        onRetry={onTestChanges || onRunAudit || onReRunVerification}
        onChangeRepository={onChangeRepository}
      />
    );
  }

  // 2. IN-PROGRESS / INCOMPLETE ANALYSIS STATE
  if (sessionStatus !== 'COMPLETE' || !pipelineResult) {
    return (
      <AnalysisProgressView
        session={session}
        logs={logs}
      />
    );
  }

  // 3. COMPLETE ANALYSIS RESULTS
  const patches = pipelineResult?.patches;
  const verification = pipelineResult?.verification;
  const decision = pipelineResult?.decision;
  const invariants = pipelineResult?.invariants;
  const report = pipelineResult?.report;

  const currentBaselineFile = baselineSnapshot?.files?.find(f => f.path === file?.path);
  const currentCandidatePatch = patches?.patches?.find(p => p.targetFile === file?.path);
  const contextualFinding = activeFinding 
    || selectedFinding 
    || findings.find(f => f.file === file?.path || f.sourceEvidence?.[0]?.file === file?.path);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#090d16] overflow-hidden">
      <ErrorBoundary
        onReturnToOverview={() => onModeChange('overview')}
        onRestartAnalysis={onTestChanges || onRunAudit}
        onChangeRepository={onChangeRepository}
      >
        {/* OVERVIEW VIEW */}
        {mode === 'overview' && (
          <OverviewView
            pipelineResult={pipelineResult}
            snapshot={snapshot}
            status={isRunning ? 'running' : 'idle'}
            onRunAudit={onRunAudit}
            onNavigateTab={onModeChange}
            onSelectFinding={onSelectFinding}
            findings={findings}
            appliedPatchIds={appliedPatchIds}
            capabilities={capabilities}
          />
        )}

        {/* FINDINGS LIST OR DETAIL VIEW */}
        {mode === 'findings' && (
          selectedFinding ? (
            <FindingDetailView
              finding={selectedFinding}
              onBack={() => onSelectFinding(null)}
              onJumpToSource={(filePath, line, findingContext) => {
                onJumpToFile(filePath, line, findingContext);
                onModeChange('source');
              }}
              onViewPatch={(filePath) => {
                onOpenDiff(filePath);
                onModeChange('changes');
              }}
              onApplyPatch={onApplyPatch}
              onRevertPatch={onRevertPatch || onRejectPatch}
              onVerifyFix={onTestChanges || onReRunVerification}
              onNavigateTab={onModeChange}
              verification={verification}
              decision={decision}
              capabilities={capabilities}
              isWorkingRevisionVerified={isWorkingRevisionVerified}
              workingRevisionId={workingRevisionId}
              testedRevisionId={testedRevisionId}
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
            appliedPatchRecords={appliedPatchRecords}
            manualChanges={manualChanges}
            onApplyPatch={onApplyPatch}
            onApplyAllPatches={onApplyAllPatches}
            onRejectPatch={onRejectPatch}
            onRevertPatch={onRevertPatch || onRejectPatch}
            onRevertFile={onRevertFile}
            onResetRepository={onResetRepository}
            onSelectFinding={(f) => {
              if (onSelectFinding) onSelectFinding(f);
              onModeChange('findings');
            }}
            findings={findings}
            snapshot={snapshot}
            baselineSnapshot={baselineSnapshot}
            onOpenInEditor={(filePath) => {
              onJumpToFile(filePath);
              onModeChange('source');
            }}
            onReRunVerification={onTestChanges || onReRunVerification}
            onTestChanges={onTestChanges}
            targetFile={targetDiffFile}
            repoName={repoName}
            onNavigateTab={onModeChange}
            verification={verification}
            decision={testResult || decision}
            testResult={testResult}
            verificationTarget={verificationTarget}
            workingRevisionId={workingRevisionId}
            baselineRevisionId={baselineRevisionId}
            isWorkingRevisionVerified={isWorkingRevisionVerified}
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
            decision={testResult || decision}
            invariants={invariants}
            onReRunVerification={onTestChanges || onReRunVerification}
            status={isRunning ? 'running' : 'idle'}
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

        {/* SOURCE CODE EXPLORER & EDITING VIEW */}
        {mode === 'source' && (
          <SourceView
            file={file}
            baselineFile={currentBaselineFile}
            highlightLine={highlightLine}
            selectedEvidence={selectedEvidence}
            activeFinding={contextualFinding}
            candidatePatch={currentCandidatePatch}
            openTabs={openTabs}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onSaveFile={onSaveFile}
            onRevertFile={onRevertFile}
            onTestChanges={onTestChanges}
            onApplyMsePatch={onApplyPatch}
            onRevertPatch={onRevertPatch || onRejectPatch}
            appliedPatches={appliedPatchRecords}
            manualEdits={manualEdits}
            workingRevisionId={workingRevisionId}
            baselineRevisionId={baselineRevisionId}
            testedRevisionId={testedRevisionId}
            isWorkingRevisionVerified={isWorkingRevisionVerified}
            testResult={testResult}
            verificationTarget={verificationTarget}
            verificationHistory={verificationHistory}
            modification={modifications[file?.path]}
            isRunning={isRunning}
            onOpenDiff={onOpenDiff}
            onNavigateToCounterexample={() => onModeChange('findings')}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}
