import React, { useState, useRef, useCallback, useMemo } from 'react';
import HeaderBar from './components/HeaderBar';
import Sidebar from './components/Sidebar';
import CenterWorkspace from './components/CenterWorkspace';
import LandingPage from './components/LandingPage';
import TechnicalDrawer from './components/workspace/TechnicalDrawer';

import { 
  loadDemoRepository, 
  loadEnterpriseFixture,
  loadZipRepository, 
  loadGitHubRepository,
  parseGitHubUrl,
  runPipeline,
  runPipelineAsync,
  applyPatches,
  applySinglePatch
} from './engine/index.js';
import { getUnifiedFindings } from './utils/findingsAdapter.js';
import { getNextAnalysisRunId, saveAnalysisRun } from './utils/sessionManager.js';

export default function App() {
  // Screen / Flow state: Landing vs Workspace
  const [isLanding, setIsLanding] = useState(true);

  // Repository state
  const [repositorySource, setRepositorySource] = useState('demo');
  const [snapshot, setSnapshot] = useState(null);
  const [pipelineResult, setPipelineResult] = useState(null);
  const [currentRunId, setCurrentRunId] = useState(null);

  // Active navigation & view state
  const [activeNav, setActiveNav] = useState('overview'); // 'overview' | 'findings' | 'changes' | 'runs' | 'verification' | 'report' | 'source'
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [isTechnicalOpen, setIsTechnicalOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);

  // Code inspection & file state
  const [activeFilePath, setActiveFilePath] = useState('src/api/webhooks.ts');
  const [openTabs, setOpenTabs] = useState(['src/server.ts', 'src/api/webhooks.ts', 'README.md']);
  const [highlightLine, setHighlightLine] = useState(null);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [targetDiffFile, setTargetDiffFile] = useState(null);

  // Patch application tracking
  const [appliedPatchIds, setAppliedPatchIds] = useState([]);

  // Telemetry & execution state
  const [status, setStatus] = useState('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [logs, setLogs] = useState([]);

  const isRunningRef = useRef(false);
  const runIdRef = useRef(0);

  // Core Audit Runner using real async pipeline
  const executeAudit = useCallback(async (targetSnapshot, customDelay = 40) => {
    const currentRunIdNum = ++runIdRef.current;
    const analysisRunId = getNextAnalysisRunId();
    const analysisStartedAt = new Date().toISOString();
    isRunningRef.current = true;

    setStatus('running');
    setLogs([`[00:00.00] [ORCHESTRATOR] Initiating MSE analysis on "${targetSnapshot.metadata?.name || 'repository'}"...`]);

    try {
      const result = await runPipelineAsync(targetSnapshot, {
        stageDelayMs: customDelay,
        runId: analysisRunId,
        onEvent: (event) => {
          if (runIdRef.current !== currentRunIdNum) return;
          if (['INGESTING', 'ANALYZING', 'RECONCILING', 'SEARCHING', 'SYNTHESIZING', 'VERIFYING', 'COMPLETE'].includes(event.phase)) {
          }
          const timeStr = new Date(event.timestamp).toLocaleTimeString();
          const logLine = `[${timeStr}] [${event.phase}] ${event.detail || event.status}`;
          setLogs(prev => [...prev, logLine]);
        },
      });

      if (runIdRef.current !== currentRunIdNum) return;

      setPipelineResult(result);
      setDurationMs(result.totalDurationMs);
      setStatus(result.decision?.status === 'VERIFIED' ? 'verified' : result.decision?.status === 'REJECTED' ? 'error' : 'needs-review');

      // Record analysis session in product memory
      const savedRun = saveAnalysisRun({
        id: analysisRunId,
        repositoryName: targetSnapshot.metadata?.name || 'repository',
        repositorySource: targetSnapshot.metadata?.source || repositorySource,
        durationMs: result.totalDurationMs,
        startTime: analysisStartedAt,
        filesCount: targetSnapshot.files?.length || 0,
        findingsCount: (result.analysis?.findings?.length || 0) + (result.drift?.findings?.length || 0),
        invariantViolations: result.invariants?.summary?.violated || 0,
        counterexamplesCount: result.counterexamples?.summary?.generated || 0,
        patchesCount: result.patches?.summary?.generated || 0,
        candidateRepairs: result.patches?.summary?.generated || 0,
        verificationOutcome: result.decision?.status || 'NEEDS_REVIEW',
        decision: result.decision,
        snapshot: targetSnapshot,
        pipelineResult: result
      });
      if (savedRun?.id) {
        setCurrentRunId(savedRun.id);
      }
    } catch (err) {
      if (runIdRef.current !== currentRunIdNum) return;
      setLogs(prev => [...prev, `[ERROR] Pipeline failure: ${err.message}`]);
      setStatus('error');
      setErrorBanner({
        title: 'Analysis Error',
        message: `Analysis could not complete: ${err.message}. Please try a different repository or use the built-in demo.`
      });
    } finally {
      if (runIdRef.current === currentRunIdNum) {
        isRunningRef.current = false;
      }
    }
  }, [currentRunId, repositorySource]);

  // Compute unified findings across Alpha, Beta, and Invariants with Evidence Chain & Blast Radius
  const unifiedFindings = useMemo(() => {
    return getUnifiedFindings(pipelineResult, appliedPatchIds, snapshot);
  }, [pipelineResult, appliedPatchIds, snapshot]);

  const patches = pipelineResult?.patches?.patches || [];
  const criticalCount = unifiedFindings.filter(f => f.severity === 'CRITICAL' && !f.isRepaired).length;

  // Handler: Select Enterprise Demo Repository
  const handleSelectEnterpriseDemo = () => {
    const enterpriseSnapshot = loadEnterpriseFixture();
    setRepositorySource('demo');
    setSnapshot(enterpriseSnapshot);
    setAppliedPatchIds([]);
    setActiveFilePath('src/api/webhooks.ts');
    setOpenTabs(['src/server.ts', 'src/api/webhooks.ts', 'README.md']);
    setHighlightLine(null);
    setSelectedEvidence(null);
    setSelectedFinding(null);
    setTargetDiffFile(null);
    setIsLanding(false);
    setActiveNav('overview');
    executeAudit(enterpriseSnapshot);
  };

  // Handler: Select Lightweight Demo Repository
  const handleSelectDemo = () => {
    const demoSnapshot = loadDemoRepository();
    setRepositorySource('demo');
    setSnapshot(demoSnapshot);
    setAppliedPatchIds([]);
    setActiveFilePath('server.js');
    setOpenTabs(['server.js', 'src/routes/webhook.js', 'specs/README.md']);
    setHighlightLine(null);
    setSelectedEvidence(null);
    setSelectedFinding(null);
    setTargetDiffFile(null);
    setIsLanding(false);
    setActiveNav('overview');
    executeAudit(demoSnapshot);
  };

  // Handler: Upload ZIP Repository
  const handleUploadZip = async (file) => {
    try {
      setStatus('running');
      setLogs(prev => [...prev, `[ZIP] Unpacking archive "${file.name}" in ephemeral RAM...`]);

      const arrayBuffer = await file.arrayBuffer();
      const zipSnapshot = await loadZipRepository(arrayBuffer, file.name.replace(/\.zip$/i, ''));

      setRepositorySource('zip');
      setSnapshot(zipSnapshot);
      setAppliedPatchIds([]);

      const firstFile = zipSnapshot.files.find(f => f.path.toLowerCase().includes('readme')) || zipSnapshot.files[0];
      const initialPath = firstFile?.path || 'index.js';
      setActiveFilePath(initialPath);
      setOpenTabs([initialPath]);
      setHighlightLine(null);
      setSelectedEvidence(null);
      setSelectedFinding(null);
      setTargetDiffFile(null);
      setIsLanding(false);
      setActiveNav('overview');

      executeAudit(zipSnapshot);
    } catch (err) {
      setLogs(prev => [...prev, `[ZIP ERROR] Failed to load ZIP: ${err.message}`]);
      setStatus('error');
      setErrorBanner({
        title: 'ZIP Ingestion Error',
        message: `${err.message}. Please ensure the archive is a valid JavaScript or TypeScript project ZIP archive.`
      });
    }
  };

  // Handler: Ingest and Analyze Public GitHub Repository
  const handleAnalyzeGithub = async (url) => {
    try {
      setStatus('running');
      const { owner, repo } = parseGitHubUrl(url);
      setLogs(prev => [...prev, `[GITHUB] Connecting to GitHub REST API for "${owner}/${repo}"...`]);

      const githubSnapshot = await loadGitHubRepository(url);
      setRepositorySource('github');
      setSnapshot(githubSnapshot);
      setAppliedPatchIds([]);

      const firstFile = githubSnapshot.files.find(f => f.path.toLowerCase().includes('readme')) || githubSnapshot.files[0];
      const initialPath = firstFile?.path || 'index.js';
      setActiveFilePath(initialPath);
      setOpenTabs([initialPath]);
      setHighlightLine(null);
      setSelectedEvidence(null);
      setSelectedFinding(null);
      setTargetDiffFile(null);
      setIsLanding(false);
      setActiveNav('overview');

      executeAudit(githubSnapshot);
    } catch (err) {
      setLogs(prev => [...prev, `[GITHUB NOTICE] ${err.message}`]);
      setErrorBanner({
        title: 'GitHub Ingestion Notice',
        message: `${err.message}. Switched to Canonical Enterprise Demo so you can continue testing without interruption.`
      });
      handleSelectEnterpriseDemo();
    }
  };

  // Handler: Manual Run Audit Button
  const handleRunAudit = () => {
    executeAudit(snapshot);
  };

  // Handler: Re-run Verification on current snapshot
  const handleReRunVerification = () => {
    executeAudit(snapshot, 30);
  };

  // Handler: Apply Single Patch to in-memory Snapshot
  const handleApplyPatch = (patch) => {
    if (!patch || appliedPatchIds.includes(patch.id)) return;

    const newSnapshot = applySinglePatch(snapshot, patch);
    setSnapshot(newSnapshot);
    const updatedApplied = [...appliedPatchIds, patch.id];
    setAppliedPatchIds(updatedApplied);

    setLogs(prev => [
      ...prev,
      `[RAM PATCH] Applied ${patch.id} (${patch.strategy}) to in-memory file "${patch.targetFile}". Zero-retention RAM state updated.`
    ]);

    executeAudit(newSnapshot, 30);
  };

  // Handler: Reject / Revert Patch
  const handleRejectPatch = (patch) => {
    if (!patch) return;
    const updatedApplied = appliedPatchIds.filter(id => id !== patch.id);
    setAppliedPatchIds(updatedApplied);

    setLogs(prev => [
      ...prev,
      `[RAM REVERT] Reverted patch ${patch.id} from in-memory file "${patch.targetFile}". Re-verifying baseline...`
    ]);

    // Reconstruct snapshot from baseline plus remaining applied patches
    const baseline = repositorySource === 'enterprise' || repositorySource === 'demo'
      ? loadEnterpriseFixture()
      : snapshot;
    const remainingPatches = patches.filter(p => updatedApplied.includes(p.id));
    const revertedSnapshot = remainingPatches.length > 0
      ? applyPatches(baseline, remainingPatches)
      : baseline;

    setSnapshot(revertedSnapshot);
    executeAudit(revertedSnapshot, 30);
  };

  // Handler: Apply All Patches
  const handleApplyAllPatches = () => {
    if (patches.length === 0) return;

    const newSnapshot = applyPatches(snapshot, patches);
    setSnapshot(newSnapshot);
    setAppliedPatchIds(patches.map(p => p.id));

    setLogs(prev => [
      ...prev,
      `[RAM PATCH] Applied all ${patches.length} synthesized atomic patches in RAM. Re-verifying repository invariants...`
    ]);

    executeAudit(newSnapshot, 30);
  };

  // Handler: Restore Historical Analysis Run
  const handleSelectRun = (run) => {
    if (!run) return;
    if (run.snapshot) setSnapshot(run.snapshot);
    if (run.pipelineResult) setPipelineResult(run.pipelineResult);
    if (run.repositorySource) setRepositorySource(run.repositorySource);
    if (run.id) setCurrentRunId(run.id);
    setSelectedFinding(null);
    setActiveNav('overview');
  };

  // Handler: Select File from Tab or Explorer
  const handleSelectFile = (filePath) => {
    setActiveFilePath(filePath);
    if (!openTabs.includes(filePath)) {
      setOpenTabs(prev => [...prev, filePath]);
    }
    setActiveNav('source');
    setHighlightLine(null);
    setSelectedEvidence(null);
  };

  // Handler: Select Tab
  const handleSelectTab = (tabPath) => {
    setActiveFilePath(tabPath);
    setActiveNav('source');
  };

  // Handler: Close Tab
  const handleCloseTab = (tabPath) => {
    const updated = openTabs.filter(p => p !== tabPath);
    setOpenTabs(updated);
    if (activeFilePath === tabPath) {
      setActiveFilePath(updated[0] || snapshot?.files?.[0]?.path || '');
    }
  };

  // Handler: Jump to File & Line (from Finding)
  const handleJumpToFile = (filePath, line, evidence) => {
    if (!filePath) return;
    handleSelectFile(filePath);
    setHighlightLine(line || null);
    setSelectedEvidence(evidence || null);
    setActiveNav('source');
  };

  // Handler: Open Diff Mode for target file
  const handleOpenDiff = (filePath) => {
    if (filePath) {
      setTargetDiffFile(filePath);
    }
    setActiveNav('changes');
  };

  // Active file object
  const currentFile = snapshot?.files?.find(f => f.path === activeFilePath) 
    || snapshot?.files?.[0] 
    || null;

  return (
    <div className="h-screen max-h-screen w-screen bg-[#090d16] text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Human-Readable Error & Notification Banner */}
      {errorBanner && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-300 shrink-0 z-50">
          <div className="flex items-center space-x-2">
            <span className="font-bold">[{errorBanner.title || 'Notice'}]</span>
            <span>{errorBanner.message}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-amber-400 hover:text-white font-bold ml-4 text-xs transition"
          >
            Dismiss ✕
          </button>
        </div>
      )}

      {/* LANDING / ENTRY STATE */}
      {isLanding ? (
        <LandingPage
          onSelectEnterpriseDemo={handleSelectEnterpriseDemo}
          onSelectDemo={handleSelectDemo}
          onUploadZip={handleUploadZip}
          onAnalyzeGithub={handleAnalyzeGithub}
          isLoading={status === 'running'}
          statusMessage={logs[logs.length - 1]}
        />
      ) : (
        /* WORKSPACE SHELL */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Header Bar */}
          <HeaderBar
            repositoryName={snapshot?.metadata?.name}
            repositorySource={repositorySource}
            status={status}
            onRunAudit={handleRunAudit}
            durationMs={durationMs}
            findingsCount={unifiedFindings.length}
            hasPatches={patches.length > 0}
            allPatchesApplied={patches.length > 0 && patches.every(p => appliedPatchIds.includes(p.id))}
            onApplyAllPatches={handleApplyAllPatches}
            onChangeRepository={() => setIsLanding(true)}
          />

          {/* Workbench Body: Clean Left Sidebar + Center Workspace */}
          <div className="flex-1 flex overflow-hidden">
            {/* Primary Left Navigation */}
            <Sidebar
              activeNav={activeNav}
              onNavigate={(nav) => {
                setActiveNav(nav);
                if (nav === 'findings') {
                  setSelectedFinding(null); // Show list when clicking nav
                }
              }}
              repositoryName={snapshot?.metadata?.name}
              findingsCount={unifiedFindings.length}
              criticalCount={criticalCount}
              patchesCount={patches.length}
              onChangeRepository={() => setIsLanding(true)}
              onToggleTechnical={() => setIsTechnicalOpen(!isTechnicalOpen)}
              isTechnicalOpen={isTechnicalOpen}
            />

            {/* Center Content Workspace */}
            <CenterWorkspace
              mode={activeNav}
              onModeChange={setActiveNav}
              selectedFinding={selectedFinding}
              onSelectFinding={setSelectedFinding}
              findings={unifiedFindings}
              file={currentFile}
              highlightLine={highlightLine}
              selectedEvidence={selectedEvidence}
              openTabs={openTabs}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
              pipelineResult={pipelineResult}
              snapshot={snapshot}
              status={status}
              onRunAudit={handleRunAudit}
              appliedPatchIds={appliedPatchIds}
              onApplyPatch={handleApplyPatch}
              onApplyAllPatches={handleApplyAllPatches}
              onRejectPatch={handleRejectPatch}
              onReRunVerification={handleReRunVerification}
              onJumpToFile={handleJumpToFile}
              targetDiffFile={targetDiffFile}
              onOpenDiff={handleOpenDiff}
              onSelectRun={handleSelectRun}
              currentRunId={currentRunId}
            />
          </div>

          {/* Progressive Disclosure: Technical Drawer */}
          <TechnicalDrawer
            isOpen={isTechnicalOpen}
            onClose={() => setIsTechnicalOpen(false)}
            pipelineResult={pipelineResult}
            logs={logs}
          />

        </div>
      )}
    </div>
  );
}
