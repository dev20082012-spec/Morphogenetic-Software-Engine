import React, { useState, useRef, useCallback } from 'react';
import HeaderBar from './components/HeaderBar';
import FileTree from './components/FileTree';
import CenterWorkspace from './components/CenterWorkspace';
import InvariantInspector from './components/InvariantInspector';
import VerificationConsole from './components/VerificationConsole';

import { 
  loadDemoRepository, 
  loadEnterpriseFixture,
  loadZipRepository, 
  runPipeline,
  runPipelineAsync,
  applyPatches,
  applySinglePatch
} from './engine/index.js';

export default function App() {
  // Repository state
  const [repositorySource, setRepositorySource] = useState('demo');
  const [snapshot, setSnapshot] = useState(() => loadDemoRepository());
  const [pipelineResult, setPipelineResult] = useState(() => runPipeline(loadDemoRepository()));

  // Active navigation & view state
  const [workspaceMode, setWorkspaceMode] = useState('overview');
  const [activeFilePath, setActiveFilePath] = useState('server.js');
  const [openTabs, setOpenTabs] = useState(['server.js', 'src/routes/webhook.js', 'specs/README.md']);
  const [highlightLine, setHighlightLine] = useState(null);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [selectedInvariant, setSelectedInvariant] = useState(null);
  const [targetDiffFile, setTargetDiffFile] = useState(null);

  // Patch application tracking
  const [appliedPatchIds, setAppliedPatchIds] = useState([]);

  // Telemetry & execution state
  const [status, setStatus] = useState('idle');
  const [currentStage, setCurrentStage] = useState('COMPLETE');
  const [durationMs, setDurationMs] = useState(18);
  const [consoleExpanded, setConsoleExpanded] = useState(true);
  const [logs, setLogs] = useState([
    '[00:00.00] [ORCHESTRATOR] Initialized Project MSE Developer Studio.',
    '[00:00.05] [INGESTING] Ingested 12 files from demo repository into ephemeral RAM.',
    '[00:00.12] [ANALYZING] Alpha AST Call-Graph analysis complete: 4 routes indexed.',
    '[00:00.18] [RECONCILING] Beta Spec Drift reconciliation complete: 3 discrepancies found.',
    '[00:00.22] [SEARCHING] Formal invariant evaluation: 4 violated, 2 satisfied.',
    '[00:00.28] [SYNTHESIZING] CEGIS Counterexamples & atomic repair patches synthesized.',
    '[00:00.35] [COMPLETE] Initial baseline loaded. Click "RUN MSE AUDIT" to re-verify.'
  ]);

  const isRunningRef = useRef(false);
  const runIdRef = useRef(0);

  // Core Audit Runner using real async pipeline
  const executeAudit = useCallback(async (targetSnapshot, customDelay = 70) => {
    const currentRunId = ++runIdRef.current;
    isRunningRef.current = true;

    setStatus('running');
    setCurrentStage('INGESTING');
    setLogs([`[00:00.00] [ORCHESTRATOR] Initiating MSE Homeostasis Prover on "${targetSnapshot.metadata?.name || 'repository'}"...`]);

    try {
      const result = await runPipelineAsync(targetSnapshot, {
        stageDelayMs: customDelay,
        onEvent: (event) => {
          if (runIdRef.current !== currentRunId) return; // Discard stale telemetry events
          // Map phase to UI stage
          if (['INGESTING', 'ANALYZING', 'RECONCILING', 'SEARCHING', 'SYNTHESIZING', 'VERIFYING', 'COMPLETE'].includes(event.phase)) {
            setCurrentStage(event.phase);
          }
          const timeStr = new Date(event.timestamp).toLocaleTimeString();
          const logLine = `[${timeStr}] [${event.phase}] ${event.detail || event.status}`;
          setLogs(prev => [...prev, logLine]);
        },
      });

      if (runIdRef.current !== currentRunId) return; // Stale execution discarded, preventing race conditions

      setPipelineResult(result);
      setDurationMs(result.totalDurationMs);
      setCurrentStage('COMPLETE');
      setStatus(result.verification?.status === 'VERIFIED' ? 'converged' : 'verified');
      if (result.invariants?.invariants?.length > 0) {
        setSelectedInvariant(result.invariants.invariants[0]);
      }
    } catch (err) {
      if (runIdRef.current !== currentRunId) return;
      setLogs(prev => [...prev, `[ERROR] Pipeline failure: ${err.message}`]);
      setStatus('error');
    } finally {
      if (runIdRef.current === currentRunId) {
        isRunningRef.current = false;
      }
    }
  }, []);

  // Handler: Select Bundled Demo Repository 1 (payment-gateway)
  const handleSelectDemo = () => {
    const demoSnapshot = loadDemoRepository();
    setRepositorySource('demo');
    setSnapshot(demoSnapshot);
    setAppliedPatchIds([]);
    setActiveFilePath('server.js');
    setOpenTabs(['server.js', 'src/routes/webhook.js', 'specs/README.md']);
    setHighlightLine(null);
    setSelectedEvidence(null);
    setTargetDiffFile(null);
    executeAudit(demoSnapshot);
  };

  // Handler: Select Canonical Enterprise Fixture (enterprise-payment-core)
  const handleSelectEnterpriseDemo = () => {
    const enterpriseSnapshot = loadEnterpriseFixture();
    setRepositorySource('demo');
    setSnapshot(enterpriseSnapshot);
    setAppliedPatchIds([]);
    setActiveFilePath('src/server.ts');
    setOpenTabs(['src/server.ts', 'src/api/webhooks.ts', 'src/security/auth.ts', 'README.md']);
    setHighlightLine(null);
    setSelectedEvidence(null);
    setTargetDiffFile(null);
    executeAudit(enterpriseSnapshot);
  };

  // Handler: Upload ZIP Repository
  const handleUploadZip = async (file) => {
    try {
      setStatus('running');
      setCurrentStage('INGESTING');
      setLogs(prev => [...prev, `[ZIP] Unpacking archive "${file.name}" in ephemeral RAM...`]);

      const arrayBuffer = await file.arrayBuffer();
      const zipSnapshot = await loadZipRepository(arrayBuffer, file.name.replace(/\.zip$/i, ''));

      setRepositorySource('zip');
      setSnapshot(zipSnapshot);
      setAppliedPatchIds([]);

      // Set initial active file to first available file or README
      const firstFile = zipSnapshot.files.find(f => f.path.toLowerCase().includes('readme')) || zipSnapshot.files[0];
      const initialPath = firstFile?.path || 'index.js';
      setActiveFilePath(initialPath);
      setOpenTabs([initialPath]);
      setHighlightLine(null);
      setSelectedEvidence(null);
      setTargetDiffFile(null);

      executeAudit(zipSnapshot);
    } catch (err) {
      setLogs(prev => [...prev, `[ZIP ERROR] Failed to load ZIP: ${err.message}`]);
      setStatus('error');
    }
  };

  // Handler: Manual Run Audit Button
  const handleRunAudit = () => {
    executeAudit(snapshot);
  };

  // Handler: Re-run Verification on current snapshot
  const handleReRunVerification = () => {
    executeAudit(snapshot, 40);
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

    // Automatically re-run audit on updated in-memory snapshot to show invariant restoration
    executeAudit(newSnapshot, 40);
  };

  // Handler: Apply All Patches
  const handleApplyAllPatches = () => {
    const patches = pipelineResult?.patches?.patches || [];
    if (patches.length === 0) return;

    const newSnapshot = applyPatches(snapshot, patches);
    setSnapshot(newSnapshot);
    setAppliedPatchIds(patches.map(p => p.id));

    setLogs(prev => [
      ...prev,
      `[RAM PATCH] Applied all ${patches.length} synthesized atomic patches in RAM. Re-verifying repository invariants...`
    ]);

    executeAudit(newSnapshot, 40);
  };

  // Handler: Select File from Explorer or Tab
  const handleSelectFile = (filePath) => {
    setActiveFilePath(filePath);
    if (!openTabs.includes(filePath)) {
      setOpenTabs(prev => [...prev, filePath]);
    }
    setWorkspaceMode('source');
    setHighlightLine(null);
    setSelectedEvidence(null);
  };

  // Handler: Select Tab
  const handleSelectTab = (tabPath) => {
    setActiveFilePath(tabPath);
    setWorkspaceMode('source');
  };

  // Handler: Close Tab
  const handleCloseTab = (tabPath) => {
    const updated = openTabs.filter(p => p !== tabPath);
    setOpenTabs(updated);
    if (activeFilePath === tabPath) {
      setActiveFilePath(updated[0] || snapshot?.files?.[0]?.path || '');
    }
  };

  // Handler: Jump to File & Line (from Drift or Invariant)
  const handleJumpToFile = (filePath, line, evidence) => {
    if (!filePath) return;
    handleSelectFile(filePath);
    setHighlightLine(line || null);
    setSelectedEvidence(evidence || null);
    setWorkspaceMode('source');
  };

  // Handler: Jump to Invariant
  const handleJumpToInvariant = (invariant, evidence) => {
    setSelectedInvariant(invariant);
    const targetFile = evidence?.file || invariant.evidence?.[0]?.file || activeFilePath;
    const targetLine = evidence?.line || invariant.evidence?.[0]?.line || null;
    handleJumpToFile(targetFile, targetLine, {
      ...evidence,
      title: `${invariant.id}: ${invariant.name}`,
    });
  };

  // Handler: Open Diff Mode for target file
  const handleOpenDiff = (filePath) => {
    if (filePath) {
      setTargetDiffFile(filePath);
    }
    setWorkspaceMode('diff');
  };

  // Reset Workbench to initial demo state
  const handleReset = () => {
    handleSelectDemo();
  };

  // Active file object
  const currentFile = snapshot?.files?.find(f => f.path === activeFilePath) 
    || snapshot?.files?.[0] 
    || null;

  // Check if current file has an associated patch
  const hasPatchForCurrentFile = Boolean(
    pipelineResult?.patches?.patches?.some(p => p.targetFile === activeFilePath)
  );

  const findings = [
    ...(pipelineResult?.analysis?.findings || []),
    ...(pipelineResult?.drift?.findings || [])
  ];

  const patches = pipelineResult?.patches?.patches || [];

  return (
    <div className="h-screen max-h-screen w-screen bg-[#090d16] text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Top Header Bar */}
      <HeaderBar
        repositorySource={repositorySource}
        repositoryName={snapshot?.metadata?.name}
        onSelectDemo={handleSelectDemo}
        onSelectEnterpriseDemo={handleSelectEnterpriseDemo}
        onUploadZip={handleUploadZip}
        status={status}
        onRunAudit={handleRunAudit}
        durationMs={durationMs}
        findingsCount={findings.length}
        hasPatches={patches.length > 0}
        allPatchesApplied={patches.length > 0 && patches.every(p => appliedPatchIds.includes(p.id))}
        onApplyAllPatches={handleApplyAllPatches}
      />

      {/* Main Workbench Body: Explorer (Left) | Center Workspace (Center) | Invariants Rail (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Repository Explorer */}
        <FileTree
          files={snapshot?.files || []}
          activeFile={activeFilePath}
          onSelectFile={handleSelectFile}
          patches={patches}
          findings={findings}
          onSelectDiff={handleOpenDiff}
          activeDiffFile={targetDiffFile}
        />

        {/* Center Pane: Developer Workspace with 7 Modes */}
        <CenterWorkspace
          mode={workspaceMode}
          onModeChange={setWorkspaceMode}
          file={currentFile}
          highlightLine={highlightLine}
          selectedEvidence={selectedEvidence}
          openTabs={openTabs}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          hasPatch={hasPatchForCurrentFile}
          onOpenDiff={handleOpenDiff}
          pipelineResult={pipelineResult}
          snapshot={snapshot}
          status={status}
          onRunAudit={handleRunAudit}
          appliedPatchIds={appliedPatchIds}
          onApplyPatch={handleApplyPatch}
          onApplyAllPatches={handleApplyAllPatches}
          onReRunVerification={handleReRunVerification}
          onJumpToFile={handleJumpToFile}
          targetDiffFile={targetDiffFile}
        />

        {/* Right Pane: System Invariants & Risk Assessment Rail */}
        <InvariantInspector
          invariants={pipelineResult?.invariants?.invariants || []}
          selectedInvariant={selectedInvariant}
          onJumpToInvariant={handleJumpToInvariant}
          onOpenDiff={handleOpenDiff}
          onOpenCounterexample={() => setWorkspaceMode('counterexample')}
          patches={patches}
          findings={findings}
          reportJson={pipelineResult?.report?.json}
          repoName={snapshot?.metadata?.name || 'repository'}
        />
      </div>

      {/* Bottom Pane: Verification & Telemetry Console Drawer */}
      <VerificationConsole
        status={status}
        currentStage={currentStage}
        logs={logs}
        onRunAudit={handleRunAudit}
        onReRunVerification={handleReRunVerification}
        onReset={handleReset}
        isExpanded={consoleExpanded}
        onToggleExpand={() => setConsoleExpanded(!consoleExpanded)}
        durationMs={durationMs}
        filesCount={snapshot?.files?.length || 0}
      />
    </div>
  );
}
