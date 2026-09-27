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
  runPipelineAsync,
  applyPatches,
  applySinglePatch,
  computeRevisionId,
  applyPatchAtomically,
  revertPatchAtomically,
  detectPatchCollision,
  getFileModificationState
} from './engine/index.js';
import { getUnifiedFindings } from './utils/findingsAdapter.js';
import { getNextAnalysisRunId, saveAnalysisRun } from './utils/sessionManager.js';
import { generateUnifiedDiff } from './utils/diffUtils.js';
import { computeCapabilityStatus } from './engine/capabilities.js';
import { createVerificationTarget, resolveWorkingVerification } from './utils/workingVerification.js';

/**
 * Creates a clean initial Single Analysis Session object.
 *
 * Allowed statuses:
 * IDLE | INGESTING | ANALYZING | RECONCILING | SEARCHING | SYNTHESIZING | VERIFYING | COMPLETE | FAILED
 */
function createInitialSession() {
  return {
    id: null,
    repository: '',
    source: 'demo',
    status: 'IDLE',
    startedAt: null,
    finishedAt: null,
    progress: {
      currentPhase: '',
      detail: '',
      stages: {
        understanding: 'pending',
        specifications: 'pending',
        riskyBehavior: 'pending',
        evidence: 'pending',
        repairs: 'pending',
        verifying: 'pending',
      }
    },
    result: null,
    error: null
  };
}

/**
 * Maps actual pipeline event phases to the 6 displayed stages.
 * Guaranteed no fake setTimeout states.
 */
function mapEventToStages(phase, status, prevStages = {}) {
  const stages = { ...prevStages };
  if (phase === 'INGESTING' || phase === 'ANALYZING') {
    stages.understanding = status === 'error' ? 'failed' : status === 'done' ? 'completed' : 'running';
  } else if (phase === 'RECONCILING') {
    stages.understanding = 'completed';
    stages.specifications = status === 'error' ? 'failed' : status === 'done' ? 'completed' : 'running';
  } else if (phase === 'SEARCHING') {
    stages.understanding = 'completed';
    stages.specifications = 'completed';
    stages.riskyBehavior = status === 'error' ? 'failed' : status === 'done' ? 'completed' : 'running';
  } else if (phase === 'SYNTHESIZING') {
    stages.understanding = 'completed';
    stages.specifications = 'completed';
    stages.riskyBehavior = 'completed';
    stages.evidence = status === 'error' ? 'failed' : status === 'done' ? 'completed' : 'running';
    stages.repairs = status === 'error' ? 'failed' : status === 'done' ? 'completed' : 'running';
  } else if (phase === 'VERIFYING') {
    stages.understanding = 'completed';
    stages.specifications = 'completed';
    stages.riskyBehavior = 'completed';
    stages.evidence = 'completed';
    stages.repairs = 'completed';
    stages.verifying = status === 'error' ? 'failed' : status === 'done' ? 'completed' : 'running';
  } else if (phase === 'COMPLETE') {
    stages.understanding = 'completed';
    stages.specifications = 'completed';
    stages.riskyBehavior = 'completed';
    stages.evidence = 'completed';
    stages.repairs = 'completed';
    stages.verifying = 'completed';
  }
  return stages;
}

export default function App() {
  // Screen / Flow state: Landing vs Workspace
  const [isLanding, setIsLanding] = useState(true);

  // 1. Single Active Analysis Session State
  const [session, setSession] = useState(createInitialSession);

  // Repository state (active in-memory snapshot vs baseline original)
  const [repositorySource, setRepositorySource] = useState('demo');
  const [snapshot, setSnapshot] = useState(null);
  const [baselineSnapshot, setBaselineSnapshot] = useState(null);
  const [baselineResult, setBaselineResult] = useState(null);
  const [currentRunId, setCurrentRunId] = useState(null);

  // Active navigation & view state
  const [activeNav, setActiveNav] = useState('overview');
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [isTechnicalOpen, setIsTechnicalOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);

  // Code inspection & file state
  const [activeFilePath, setActiveFilePath] = useState('src/api/webhooks.ts');
  const [openTabs, setOpenTabs] = useState(['src/server.ts', 'src/api/webhooks.ts', 'README.md']);
  const [highlightLine, setHighlightLine] = useState(null);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [targetDiffFile, setTargetDiffFile] = useState(null);

  // Manual in-memory edits & Patch application tracking
  const [_manualEdits, setManualEdits] = useState({});
  const [modifications, setModifications] = useState({});
  const [appliedPatchIds, setAppliedPatchIds] = useState([]);
  const [appliedPatchRecords, setAppliedPatchRecords] = useState([]);
  const [testedRevisionId, setTestedRevisionId] = useState(null);
  const [revertConflict, setRevertConflict] = useState(null);
  const [verificationTarget, setVerificationTarget] = useState(null);
  const [lastVerificationResult, setLastVerificationResult] = useState(null);
  const [verificationHistory, setVerificationHistory] = useState([]);

  // Telemetry & duration
  const [durationMs, setDurationMs] = useState(0);
  const [logs, setLogs] = useState([]);

  // 2. Stale Run Protection via Monotonic Tokens
  const sessionCounterRef = useRef(0);
  const activeSessionTokenRef = useRef(0);
  const baselineResultRef = useRef(null);

  // Deterministic revision identity for baseline and working snapshot
  const workingRevisionId = useMemo(() => computeRevisionId(snapshot), [snapshot]);
  const baselineRevisionId = useMemo(() => computeRevisionId(baselineSnapshot), [baselineSnapshot]);

  // Is current working revision genuine verified?
  const isWorkingRevisionVerified = Boolean(
    lastVerificationResult &&
    lastVerificationResult.status === 'VERIFIED' &&
    (lastVerificationResult.testedRevision === workingRevisionId || testedRevisionId === workingRevisionId)
  );

  // Helper: check if session is actively running
  const isRunning = ['INGESTING', 'ANALYZING', 'RECONCILING', 'SEARCHING', 'SYNTHESIZING', 'VERIFYING'].includes(session.status);

  /**
   * REQUIREMENT 1: ANALYSIS RESET
   * Immediately clears all previous analysis states and creates a new atomic session.
   */
  const resetAnalysisSession = useCallback((repoName, source, runId, { preserveWorkingState = false } = {}) => {
    setSelectedFinding(null);
    setSelectedEvidence(null);
    if (!preserveWorkingState) {
      setAppliedPatchIds([]);
      setAppliedPatchRecords([]);
      setTestedRevisionId(null);
      setRevertConflict(null);
    }
    setTargetDiffFile(null);
    setHighlightLine(null);
    setDurationMs(0);
    setErrorBanner(null);
    setLogs([`[00:00.00] [ORCHESTRATOR] Initiating MSE analysis session for "${repoName}"...`]);

    const initialStages = {
      understanding: 'running',
      specifications: 'pending',
      riskyBehavior: 'pending',
      evidence: 'pending',
      repairs: 'pending',
      verifying: 'pending',
    };

    const newSession = {
      id: runId,
      repository: repoName,
      source,
      status: 'INGESTING',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      progress: {
        currentPhase: 'INGESTING',
        detail: `Ingesting repository "${repoName}" into ephemeral RAM...`,
        stages: initialStages
      },
      result: null,
      error: null
    };

    setSession(newSession);
    return newSession;
  }, []);

  /**
   * Core Pipeline Runner with Stale Run Protection
   */
  const executeSessionPipeline = useCallback(async (targetSnapshot, sessionToken, runId, source, customDelay = 40, verificationContext = null) => {
    try {
      const result = await runPipelineAsync(targetSnapshot, {
        stageDelayMs: customDelay,
        runId,
        onEvent: (event) => {
          if (activeSessionTokenRef.current !== sessionToken) return;

          const timeStr = new Date(event.timestamp).toLocaleTimeString();
          const logLine = `[${timeStr}] [${event.phase}] ${event.detail || event.status}`;
          setLogs(prev => [...prev, logLine]);

          const allowedStatuses = ['INGESTING', 'ANALYZING', 'RECONCILING', 'SEARCHING', 'SYNTHESIZING', 'VERIFYING'];
          const newStatus = allowedStatuses.includes(event.phase) ? event.phase : undefined;

          setSession(prev => {
            if (activeSessionTokenRef.current !== sessionToken) return prev;
            return {
              ...prev,
              status: newStatus || prev.status,
              progress: {
                currentPhase: event.phase,
                detail: event.detail || event.status,
                stages: mapEventToStages(event.phase, event.status, prev.progress?.stages)
              }
            };
          });
        },
      });

      if (activeSessionTokenRef.current !== sessionToken) return;

      const finishedAt = new Date().toISOString();
      setDurationMs(result.totalDurationMs);

      let verificationResult = null;
      if (verificationContext?.kind === 'test') {
        const testedRev = verificationContext.testedRevision || computeRevisionId(targetSnapshot);
        verificationResult = resolveWorkingVerification({
          baselineResult: verificationContext.baselineResult,
          workingResult: result,
          target: verificationContext.target,
          baselineRevision: verificationContext.baselineRevision,
          testedRevision: testedRev,
          changedFiles: verificationContext.changedFiles,
          timestamp: finishedAt,
        });
        setLastVerificationResult(verificationResult);
        setTestedRevisionId(testedRev);
        setVerificationHistory(prev => [...prev, { ...verificationResult, attempt: prev.length + 1 }]);
        setModifications(prev => Object.fromEntries(Object.entries(prev).map(([filePath, modification]) => [
          filePath,
          modification.status === 'reverted' ? modification : {
            ...modification,
            status: verificationResult.status === 'VERIFIED'
              ? 'verified'
              : verificationResult.status === 'FAILED'
                ? 'failed'
                : 'needs_review',
            testedRevision: testedRev,
          },
        ])));
      } else if (verificationContext?.kind === 'baseline') {
        baselineResultRef.current = result;
        setBaselineResult(result);
      }

      // Commit COMPLETE session
      setSession(prev => ({
        ...prev,
        status: 'COMPLETE',
        finishedAt,
        progress: {
          currentPhase: 'COMPLETE',
          detail: verificationContext?.kind === 'test' ? 'Working snapshot analysis complete.' : 'Analysis complete.',
          stages: {
            understanding: 'completed',
            specifications: 'completed',
            riskyBehavior: 'completed',
            evidence: 'completed',
            repairs: 'completed',
            verifying: 'completed',
          }
        },
        result,
        error: null
      }));

      // Record analysis run in product memory
      const savedRun = saveAnalysisRun({
        id: runId,
        repositoryName: targetSnapshot.metadata?.name || 'repository',
        repositorySource: targetSnapshot.metadata?.source || source,
        durationMs: result.totalDurationMs,
        startTime: prev => prev?.startedAt || finishedAt,
        filesCount: targetSnapshot.files?.length || 0,
        findingsCount: (result.analysis?.findings?.length || 0) + (result.drift?.findings?.length || 0),
        invariantViolations: result.invariants?.summary?.violated || 0,
        counterexamplesCount: result.counterexamples?.summary?.generated || 0,
        patchesCount: result.patches?.summary?.generated || 0,
        candidateRepairs: result.patches?.summary?.generated || 0,
        verificationOutcome: verificationResult?.status || result.decision?.status || 'NEEDS_REVIEW',
        decision: result.decision,
        verificationResult,
        snapshot: targetSnapshot,
        pipelineResult: result
      });
      if (savedRun?.id) {
        setCurrentRunId(savedRun.id);
      }
    } catch (err) {
      if (activeSessionTokenRef.current !== sessionToken) return;
      setLogs(prev => [...prev, `[ERROR] Pipeline failure: ${err.message}`]);
      setSession(prev => ({
        ...prev,
        status: 'FAILED',
        finishedAt: new Date().toISOString(),
        error: err.message,
        progress: {
          ...prev.progress,
          detail: `Pipeline failed: ${err.message}`
        }
      }));
    }
  }, []);

  /**
   * DEMO FLOW
   */
  const handleSelectEnterpriseDemo = () => {
    const sessionToken = ++sessionCounterRef.current;
    activeSessionTokenRef.current = sessionToken;
    const analysisRunId = getNextAnalysisRunId();

    resetAnalysisSession('enterprise-payment-core', 'demo', analysisRunId);
    const enterpriseSnapshot = loadEnterpriseFixture();
    setRepositorySource('demo');
    setBaselineSnapshot(enterpriseSnapshot);
    setSnapshot(enterpriseSnapshot);
    setManualEdits({});
    setModifications({});
    setVerificationTarget(null);
    setLastVerificationResult(null);
    setVerificationHistory([]);
    baselineResultRef.current = null;
    setBaselineResult(null);
    setActiveFilePath('src/api/webhooks.ts');
    setOpenTabs(['src/server.ts', 'src/api/webhooks.ts', 'README.md']);
    setIsLanding(false);
    setActiveNav('overview');

    executeSessionPipeline(enterpriseSnapshot, sessionToken, analysisRunId, 'demo', 40, { kind: 'baseline' });
  };

  const handleSelectDemo = () => {
    const sessionToken = ++sessionCounterRef.current;
    activeSessionTokenRef.current = sessionToken;
    const analysisRunId = getNextAnalysisRunId();

    resetAnalysisSession('payment-gateway', 'demo', analysisRunId);
    const demoSnapshot = loadDemoRepository();
    setRepositorySource('demo');
    setBaselineSnapshot(demoSnapshot);
    setSnapshot(demoSnapshot);
    setManualEdits({});
    setModifications({});
    setVerificationTarget(null);
    setLastVerificationResult(null);
    setVerificationHistory([]);
    baselineResultRef.current = null;
    setBaselineResult(null);
    setActiveFilePath('server.js');
    setOpenTabs(['server.js', 'src/routes/webhook.js', 'specs/README.md']);
    setIsLanding(false);
    setActiveNav('overview');

    executeSessionPipeline(demoSnapshot, sessionToken, analysisRunId, 'demo', 40, { kind: 'baseline' });
  };

  /**
   * ZIP FLOW
   */
  const handleUploadZip = async (file) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setErrorBanner({
        title: 'Invalid File',
        message: 'Please upload a valid .zip archive of a JavaScript or TypeScript project.'
      });
      return;
    }

    const sessionToken = ++sessionCounterRef.current;
    activeSessionTokenRef.current = sessionToken;
    const analysisRunId = getNextAnalysisRunId();
    const repoName = file.name.replace(/\.zip$/i, '') || 'zip-repository';

    resetAnalysisSession(repoName, 'zip', analysisRunId);
    setRepositorySource('zip');
    setSnapshot(null);
    setBaselineSnapshot(null);
    setManualEdits({});
    setModifications({});
    setVerificationTarget(null);
    setLastVerificationResult(null);
    setVerificationHistory([]);
    baselineResultRef.current = null;
    setBaselineResult(null);
    setIsLanding(false);
    setActiveNav('overview');

    try {
      setLogs(prev => [...prev, `[ZIP] Unpacking archive "${file.name}" into ephemeral RAM...`]);
      const arrayBuffer = await file.arrayBuffer();

      if (activeSessionTokenRef.current !== sessionToken) return;

      const zipSnapshot = await loadZipRepository(arrayBuffer, repoName);
      if (activeSessionTokenRef.current !== sessionToken) return;

      setBaselineSnapshot(zipSnapshot);
      setSnapshot(zipSnapshot);
      const firstFile = zipSnapshot.files?.find(f => f.path.toLowerCase().includes('readme')) || zipSnapshot.files?.[0];
      const initialPath = firstFile?.path || 'index.js';
      setActiveFilePath(initialPath);
      setOpenTabs([initialPath]);

      executeSessionPipeline(zipSnapshot, sessionToken, analysisRunId, 'zip', 40, { kind: 'baseline' });
    } catch (err) {
      if (activeSessionTokenRef.current !== sessionToken) return;
      setLogs(prev => [...prev, `[ZIP ERROR] Failed to load ZIP: ${err.message}`]);
      setSession(prev => ({
        ...prev,
        status: 'FAILED',
        finishedAt: new Date().toISOString(),
        error: `ZIP Ingestion Error: ${err.message}`,
        progress: {
          ...prev.progress,
          detail: `ZIP ingestion failed: ${err.message}`
        }
      }));
    }
  };

  /**
   * GITHUB FLOW
   */
  const handleAnalyzeGithub = async (url) => {
    if (!url || !url.trim()) return;

    let parsed;
    try {
      parsed = parseGitHubUrl(url.trim());
    } catch (err) {
      setErrorBanner({
        title: 'Invalid GitHub URL',
        message: err.message || 'Please provide a valid GitHub repository URL (e.g., https://github.com/owner/repo).'
      });
      return;
    }

    const sessionToken = ++sessionCounterRef.current;
    activeSessionTokenRef.current = sessionToken;
    const analysisRunId = getNextAnalysisRunId();
    const repoName = `${parsed.owner}/${parsed.repo}`;

    resetAnalysisSession(repoName, 'github', analysisRunId);
    setRepositorySource('github');
    setSnapshot(null);
    setBaselineSnapshot(null);
    setManualEdits({});
    setModifications({});
    setVerificationTarget(null);
    setLastVerificationResult(null);
    setVerificationHistory([]);
    baselineResultRef.current = null;
    setBaselineResult(null);
    setIsLanding(false);
    setActiveNav('overview');

    try {
      setLogs(prev => [...prev, `[GITHUB] Connecting to GitHub REST API for "${repoName}"...`]);
      const githubSnapshot = await loadGitHubRepository(url.trim());

      if (activeSessionTokenRef.current !== sessionToken) return;

      setBaselineSnapshot(githubSnapshot);
      setSnapshot(githubSnapshot);
      const firstFile = githubSnapshot.files?.find(f => f.path.toLowerCase().includes('readme')) || githubSnapshot.files?.[0];
      const initialPath = firstFile?.path || 'index.js';
      setActiveFilePath(initialPath);
      setOpenTabs([initialPath]);

      executeSessionPipeline(githubSnapshot, sessionToken, analysisRunId, 'github', 40, { kind: 'baseline' });
    } catch (err) {
      if (activeSessionTokenRef.current !== sessionToken) return;
      setLogs(prev => [...prev, `[GITHUB ERROR] ${err.message}`]);
      setSession(prev => ({
        ...prev,
        status: 'FAILED',
        finishedAt: new Date().toISOString(),
        error: `GitHub Ingestion Error: ${err.message}`,
        progress: {
          ...prev.progress,
          detail: `GitHub ingestion failed: ${err.message}`
        }
      }));
    }
  };

  /**
   * SAVE TO MSE RAM (Requirement 2 & 8)
   * Updates ONLY the in-memory RepositorySnapshot.
   */
  const handleSaveFile = (filePath, newContent) => {
    if (!snapshot || !baselineSnapshot) return;
    const baselineFile = baselineSnapshot.files?.find(file => file.path === filePath);
    if (!baselineFile) return;

    const newFiles = snapshot.files.map(f => {
      if (f.path === filePath) {
        return {
          ...f,
          content: newContent,
          sizeBytes: new Blob([newContent]).size
        };
      }
      return f;
    });

    const updatedSnapshot = { ...snapshot, files: newFiles };
    setSnapshot(updatedSnapshot);
    setManualEdits(prev => ({ ...prev, [filePath]: newContent }));

    const hasAppliedPatch = appliedPatchRecords.some(p => p.filePath === filePath && p.status === 'applied');
    const sourceLabel = hasAppliedPatch ? 'mse_patch_and_manual' : 'manual';

    setModifications(prev => ({
      ...prev,
      [filePath]: {
        filePath,
        baselineContent: baselineFile.content,
        currentContent: newContent,
        source: sourceLabel,
        status: newContent === baselineFile.content ? 'reverted' : 'modified',
        revision: (prev[filePath]?.revision || 0) + 1,
        testedRevision: null,
      },
    }));

    // Verification tied to previous revision no longer applies
    setLastVerificationResult(null);
    setTestedRevisionId(null);

    setLogs(prev => [
      ...prev,
      `[RAM SAVE] Saved changes to "${filePath}" in ephemeral RAM buffer [Rev: ${computeRevisionId(updatedSnapshot)}]. State: MODIFIED — NOT VERIFIED.`
    ]);
  };

  /**
   * REVERT SINGLE FILE (Requirement 10)
   * Restores file to baseline original in RAM.
   */
  const handleRevertFile = (filePath) => {
    if (!snapshot || !baselineSnapshot) return;
    const base = baselineSnapshot.files?.find(f => f.path === filePath);
    if (!base) return;

    const newFiles = snapshot.files.map(f => f.path === filePath ? { ...base } : f);
    const updatedSnapshot = { ...snapshot, files: newFiles };
    setSnapshot(updatedSnapshot);
    setManualEdits(prev => {
      const next = { ...prev };
      delete next[filePath];
      return next;
    });
    setAppliedPatchIds(prev => prev.filter(id => {
      const rec = appliedPatchRecords.find(p => p.patchId === id);
      return rec ? rec.filePath !== filePath : true;
    }));
    setAppliedPatchRecords(prev => prev.map(p => p.filePath === filePath ? { ...p, status: 'reverted' } : p));
    setModifications(prev => {
      const next = { ...prev };
      delete next[filePath];
      return next;
    });
    setLastVerificationResult(null);
    setTestedRevisionId(null);

    setLogs(prev => [
      ...prev,
      `[RAM REVERT] Reverted "${filePath}" back to baseline original in RAM [Rev: ${computeRevisionId(updatedSnapshot)}].`
    ]);
  };

  /**
   * RESET REPOSITORY (Requirement 10)
   * Restores WORKING SNAPSHOT = BASELINE SNAPSHOT
   * Clears: manual modifications, applied patches, working verification results.
   * Does NOT corrupt: original repository metadata, repository source identity, available analysis history.
   */
  const handleResetRepository = () => {
    if (!baselineSnapshot) return;

    setSnapshot(baselineSnapshot);
    setManualEdits({});
    setModifications({});
    setAppliedPatchIds([]);
    setAppliedPatchRecords([]);
    setVerificationTarget(null);
    setLastVerificationResult(null);
    setTestedRevisionId(null);
    setRevertConflict(null);

    setLogs(prev => [
      ...prev,
      `[RAM RESET] Reset working snapshot back to baseline repository [Rev: ${computeRevisionId(baselineSnapshot)}]. Cleared applied patches and working modifications.`
    ]);
  };

  /**
   * TEST CHANGES (Requirements 4, 5, 6, 7, 11, 12)
   * Runs the existing MSE analysis/verification pipeline against current working snapshot.
   */
  const handleTestChanges = () => {
    if (!snapshot) return;

    const sessionToken = ++sessionCounterRef.current;
    activeSessionTokenRef.current = sessionToken;
    const analysisRunId = getNextAnalysisRunId();
    const repoName = snapshot.metadata?.name || session.repository || 'repository';
    const workingRev = computeRevisionId(snapshot);

    setLogs(prev => [
      ...prev,
      `[RAM TEST] Initiating MSE verification checks on current working snapshot [Rev: ${workingRev}]...`
    ]);

    const changedFiles = Object.values(modifications)
      .filter(modification => modification.status !== 'reverted')
      .map(modification => modification.filePath);
    setModifications(prev => Object.fromEntries(Object.entries(prev).map(([filePath, modification]) => [
      filePath,
      modification.status === 'reverted' ? modification : { ...modification, status: 'testing' },
    ])));
    resetAnalysisSession(repoName, repositorySource, analysisRunId, { preserveWorkingState: true });

    let activeTarget = verificationTarget;
    if (!activeTarget && selectedFinding) {
      activeTarget = createVerificationTarget(
        selectedFinding,
        baselineResultRef.current || baselineResult || session.result,
        baselineResult?.report?.summary?.runId || currentRunId,
      );
    }
    if (!activeTarget && appliedPatchRecords.length > 0) {
      const activeRecord = appliedPatchRecords.find(r => r.status === 'applied');
      if (activeRecord) {
        const matchingFinding = (unifiedFindings || []).find(f =>
          f.id === activeRecord.findingId || f.patch?.id === activeRecord.patchId || f.file === activeRecord.filePath
        );
        if (matchingFinding) {
          activeTarget = createVerificationTarget(
            matchingFinding,
            baselineResultRef.current || baselineResult || session.result,
            baselineResult?.report?.summary?.runId || currentRunId,
          );
        }
      }
    }
    if (!activeTarget && changedFiles.length > 0) {
      const matchingFinding = (unifiedFindings || []).find(f => changedFiles.includes(f.file));
      if (matchingFinding) {
        activeTarget = createVerificationTarget(
          matchingFinding,
          baselineResultRef.current || baselineResult || session.result,
          baselineResult?.report?.summary?.runId || currentRunId,
        );
      }
    }

    executeSessionPipeline(snapshot, sessionToken, analysisRunId, repositorySource, 30, {
      kind: 'test',
      target: activeTarget,
      baselineResult: baselineResultRef.current || baselineResult,
      baselineRevision: activeTarget?.baselineRevision || baselineResult?.report?.summary?.runId || baselineRevisionId,
      testedRevision: workingRev,
      changedFiles,
    });
  };

  /**
   * Handler: Re-run Audit
   */
  const handleRunAudit = () => {
    handleTestChanges();
  };

  /**
   * Handler: Change Repository Action
   */
  const handleChangeRepository = () => {
    if (isRunning) return;

    activeSessionTokenRef.current = ++sessionCounterRef.current;
    setSession(createInitialSession());
    setSnapshot(null);
    setBaselineSnapshot(null);
    setManualEdits({});
    setModifications({});
    setVerificationTarget(null);
    setLastVerificationResult(null);
    setTestedRevisionId(null);
    setVerificationHistory([]);
    baselineResultRef.current = null;
    setBaselineResult(null);
    setSelectedFinding(null);
    setSelectedEvidence(null);
    setAppliedPatchIds([]);
    setAppliedPatchRecords([]);
    setRevertConflict(null);
    setTargetDiffFile(null);
    setHighlightLine(null);
    setDurationMs(0);
    setLogs([]);
    setErrorBanner(null);
    setIsLanding(true);
    setActiveNav('overview');
  };

  /**
   * Handler: Apply Single Patch to Working Snapshot (Requirements 1, 2, 3, 4, 14, 15)
   * Atomic, stateful, validates collision, preserves finding context, invalidates old verification.
   */
  const handleApplyPatch = (patch) => {
    if (!patch || !snapshot) return;

    if (appliedPatchIds.includes(patch.id)) {
      setErrorBanner({
        title: 'PATCH ALREADY APPLIED',
        message: `Patch "${patch.id}" is already applied to "${patch.targetFile}".`
      });
      return;
    }

    const applicationResult = applyPatchAtomically({
      workingSnapshot: snapshot,
      baselineSnapshot,
      patch,
      finding: currentSelectedFinding,
      appliedPatches: appliedPatchRecords
    });

    if (!applicationResult.ok) {
      setErrorBanner({
        title: 'PATCH NOT APPLIED',
        message: applicationResult.error || 'Failed to apply patch atomically.'
      });
      setLogs(prev => [
        ...prev,
        `[PATCH REJECTED] PATCH NOT APPLIED: ${applicationResult.error}`
      ]);
      return;
    }

    // Atomic update of working snapshot only
    setSnapshot(applicationResult.newSnapshot);
    setAppliedPatchIds(prev => [...prev, patch.id]);
    setAppliedPatchRecords(prev => [
      ...prev.filter(p => p.patchId !== patch.id),
      applicationResult.patchRecord
    ]);

    const hasManual = Boolean(_manualEdits[patch.targetFile]);
    const sourceLabel = hasManual ? 'mse_patch_and_manual' : 'mse_patch';

    setModifications(prev => ({
      ...prev,
      [patch.targetFile]: {
        filePath: patch.targetFile,
        baselineContent: applicationResult.patchRecord.baselineContent,
        currentContent: applicationResult.patchRecord.appliedContent,
        source: sourceLabel,
        status: 'modified',
        revision: (prev[patch.targetFile]?.revision || 0) + 1,
        testedRevision: null,
      },
    }));

    // Invalidate old verification results for the previous revision
    setLastVerificationResult(null);
    setTestedRevisionId(null);

    setLogs(prev => [
      ...prev,
      `[RAM PATCH] Applied patch ${patch.id} (${patch.strategy}) to working snapshot "${patch.targetFile}" [Rev: ${applicationResult.newRevisionId}]. State: MODIFIED — NOT VERIFIED.`
    ]);
  };

  /**
   * Handler: Revert Patch (Requirement 9)
   * Safely reverts patch; detects conflicts if manual edits exist on the file.
   */
  const handleRejectPatch = (patch, force = false) => {
    if (!patch || !snapshot) return;

    const revertResult = revertPatchAtomically({
      baselineSnapshot,
      workingSnapshot: snapshot,
      patchId: patch.id,
      appliedPatches: appliedPatchRecords,
      manualEdits: _manualEdits,
      force
    });

    if (!revertResult.ok) {
      if (revertResult.hasConflict) {
        setRevertConflict({
          patch,
          conflictMessage: revertResult.conflictMessage,
          filePath: revertResult.filePath,
          currentContent: revertResult.currentContent,
          patchContent: revertResult.patchContent,
          baselineContent: revertResult.baselineContent
        });
        return;
      }
      setErrorBanner({
        title: 'PATCH NOT REVERTED',
        message: revertResult.error || 'Failed to revert patch.'
      });
      return;
    }

    setSnapshot(revertResult.newSnapshot);
    const updatedApplied = appliedPatchIds.filter(id => id !== patch.id);
    setAppliedPatchIds(updatedApplied);
    setAppliedPatchRecords(prev => prev.map(p => p.patchId === patch.id ? { ...p, status: 'reverted' } : p));
    setRevertConflict(null);

    const baseFile = baselineSnapshot?.files?.find(f => f.path === patch.targetFile);
    const isNowClean = revertResult.targetContent === baseFile?.content;

    setModifications(prev => {
      const next = { ...prev };
      if (isNowClean) {
        delete next[patch.targetFile];
      } else {
        next[patch.targetFile] = {
          ...(next[patch.targetFile] || {}),
          filePath: patch.targetFile,
          baselineContent: baseFile?.content || '',
          currentContent: revertResult.targetContent,
          source: _manualEdits[patch.targetFile] ? 'manual' : 'mse_patch',
          status: 'modified',
          revision: (next[patch.targetFile]?.revision || 0) + 1,
          testedRevision: null,
        };
      }
      return next;
    });

    // Invalidate verification
    setLastVerificationResult(null);
    setTestedRevisionId(null);

    setLogs(prev => [
      ...prev,
      `[RAM REVERT] Reverted patch ${patch.id} from working snapshot "${patch.targetFile}" [Rev: ${revertResult.newRevisionId}]. Baseline restored.`
    ]);
  };

  /**
   * Handler: Apply All Patches Atomically
   */
  const handleApplyAllPatches = () => {
    const availablePatches = session.result?.patches?.patches || [];
    if (availablePatches.length === 0 || !snapshot) return;

    let currentWorkingSnapshot = snapshot;
    const newRecords = [...appliedPatchRecords];
    const newAppliedIds = [...appliedPatchIds];
    let appliedCount = 0;

    for (const patch of availablePatches) {
      if (newAppliedIds.includes(patch.id)) continue;
      const res = applyPatchAtomically({
        workingSnapshot: currentWorkingSnapshot,
        baselineSnapshot,
        patch,
        appliedPatches: newRecords
      });
      if (res.ok) {
        currentWorkingSnapshot = res.newSnapshot;
        newAppliedIds.push(patch.id);
        newRecords.push(res.patchRecord);
        appliedCount++;
      } else {
        setLogs(prev => [...prev, `[BATCH PATCH SKIP] ${patch.id}: ${res.error}`]);
      }
    }

    if (appliedCount > 0) {
      setSnapshot(currentWorkingSnapshot);
      setAppliedPatchIds(newAppliedIds);
      setAppliedPatchRecords(newRecords);
      setModifications(prev => {
        const next = { ...prev };
        for (const rec of newRecords) {
          if (rec.status === 'applied') {
            next[rec.filePath] = {
              filePath: rec.filePath,
              baselineContent: rec.baselineContent,
              currentContent: rec.appliedContent,
              source: _manualEdits[rec.filePath] ? 'mse_patch_and_manual' : 'mse_patch',
              status: 'modified',
              revision: (next[rec.filePath]?.revision || 0) + 1,
              testedRevision: null,
            };
          }
        }
        return next;
      });
      setLastVerificationResult(null);
      setTestedRevisionId(null);

      setLogs(prev => [
        ...prev,
        `[RAM PATCH] Applied ${appliedCount} synthesized atomic patch(es) in working snapshot [Rev: ${computeRevisionId(currentWorkingSnapshot)}]. State: MODIFIED — NOT VERIFIED.`
      ]);
    }
  };

  /**
   * Handler: Restore Historical Analysis Run
   */
  const handleSelectRun = (run) => {
    if (!run || isRunning) return;

    activeSessionTokenRef.current = ++sessionCounterRef.current;

    if (run.snapshot) {
      setSnapshot(run.snapshot);
      setBaselineSnapshot(run.snapshot);
    }
    if (run.repositorySource) setRepositorySource(run.repositorySource);
    if (run.id) setCurrentRunId(run.id);

    setSession({
      id: run.id,
      repository: run.repositoryName || run.snapshot?.metadata?.name || 'repository',
      source: run.repositorySource || 'demo',
      status: 'COMPLETE',
      startedAt: run.startTime || null,
      finishedAt: run.timestamp || null,
      progress: {
        currentPhase: 'COMPLETE',
        detail: 'Loaded from local run history.',
        stages: {
          understanding: 'completed',
          specifications: 'completed',
          riskyBehavior: 'completed',
          evidence: 'completed',
          repairs: 'completed',
          verifying: 'completed',
        }
      },
      result: run.pipelineResult,
      error: null
    });

    setDurationMs(run.durationMs || run.pipelineResult?.totalDurationMs || 0);
    setSelectedFinding(null);
    setSelectedEvidence(null);
    setAppliedPatchIds([]);
    setModifications({});
    setVerificationTarget(null);
    setLastVerificationResult(run.verificationResult || null);
    setVerificationHistory(run.verificationResult ? [run.verificationResult] : []);
    baselineResultRef.current = run.pipelineResult || null;
    setBaselineResult(run.pipelineResult || null);
    setTargetDiffFile(null);
    setActiveNav('overview');
  };

  /**
   * Handlers: File Inspection & Navigation
   */
  const handleSelectFile = (filePath) => {
    setActiveFilePath(filePath);
    if (!openTabs.includes(filePath)) {
      setOpenTabs(prev => [...prev, filePath]);
    }
    setActiveNav('source');
    setHighlightLine(null);
    setSelectedEvidence(null);
  };

  const handleSelectTab = (tabPath) => {
    setActiveFilePath(tabPath);
    setActiveNav('source');
  };

  const handleCloseTab = (tabPath) => {
    const updated = openTabs.filter(p => p !== tabPath);
    setOpenTabs(updated);
    if (activeFilePath === tabPath) {
      setActiveFilePath(updated[0] || snapshot?.files?.[0]?.path || '');
    }
  };

  const handleJumpToFile = (filePath, line, evidence) => {
    if (!filePath) return;
    handleSelectFile(filePath);
    setHighlightLine(line || null);
    setSelectedEvidence(evidence || null);
    if (evidence?.id) {
      const matchFinding = unifiedFindings.find(f => f.id === evidence.id || f.findingId === evidence.id);
      const finding = matchFinding || evidence;
      if (matchFinding) setSelectedFinding(matchFinding);
      setVerificationTarget(createVerificationTarget(
        finding,
        baselineResultRef.current || baselineResult || session.result,
        baselineResult?.report?.summary?.runId || currentRunId,
      ));
    }
    setActiveNav('source');
  };

  const handleOpenDiff = (filePath) => {
    if (filePath) {
      setTargetDiffFile(filePath);
    }
    setActiveNav('changes');
  };

  // Compute unified findings ONLY from current session's valid pipelineResult
  const unifiedFindings = useMemo(() => {
    if (session.status !== 'COMPLETE' || !session.result) {
      return [];
    }
    return getUnifiedFindings(session.result, appliedPatchIds, snapshot, {
      verification: lastVerificationResult,
      lastVerificationResult,
      verificationHistory,
      workingRevisionId,
      modifications,
      isTesting: session.status === 'VERIFYING' || session.status === 'ANALYZING',
      appliedPatchRecords
    });
  }, [
    session.status,
    session.result,
    appliedPatchIds,
    snapshot,
    lastVerificationResult,
    verificationHistory,
    workingRevisionId,
    modifications,
    appliedPatchRecords
  ]);

  // Compute manual changes (Baseline vs In-Memory snapshot) (Requirement 11)
  const manualChanges = useMemo(() => {
    if (!snapshot || !baselineSnapshot) return [];
    const list = [];
    for (const file of snapshot.files || []) {
      const base = baselineSnapshot.files?.find(f => f.path === file.path);
      if (base && base.content !== file.content) {
        const diff = generateUnifiedDiff(file.path, base.content, file.content);
        const modification = modifications[file.path];
        list.push({
          filePath: file.path,
          diff,
          original: base.content,
          modified: file.content,
          source: modification?.source || 'manual',
          status: modification?.status || 'modified',
          isVerified: modification?.status === 'verified' && lastVerificationResult?.testedRevision === modification?.testedRevision,
        });
      }
    }
    return list;
  }, [snapshot, baselineSnapshot, modifications, lastVerificationResult]);

  // Compute First-Class Capability Model for the active repository session
  const capabilities = useMemo(() => {
    return computeCapabilityStatus({
      session,
      pipelineResult: session.result,
      findings: unifiedFindings,
      snapshot,
      baselineSnapshot,
      manualChanges,
      appliedPatchIds,
      lastTestResult: lastVerificationResult
    });
  }, [session, unifiedFindings, snapshot, baselineSnapshot, manualChanges, appliedPatchIds, lastVerificationResult]);

  // Ensure selectedFinding dynamically updates repaired/patch status without losing selection
  const currentSelectedFinding = useMemo(() => {
    if (!selectedFinding) return null;
    const fId = selectedFinding.id || selectedFinding.findingId;
    return unifiedFindings.find(f => (f.id === fId || f.findingId === fId)) || selectedFinding;
  }, [selectedFinding, unifiedFindings]);

  const patches = session.result?.patches?.patches || [];
  const criticalCount = unifiedFindings.filter(f => f.severity === 'CRITICAL' && !f.isRepaired).length;

  const currentFile = snapshot?.files?.find(f => f.path === activeFilePath) 
    || snapshot?.files?.[0] 
    || null;

  const currentStatusLabel = isRunning
    ? 'running'
    : session.status === 'COMPLETE'
    ? (session.result?.decision?.status === 'VERIFIED' ? 'verified' : 'needs-review')
    : session.status === 'FAILED'
    ? 'error'
    : 'idle';

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

      {/* Revert Conflict Resolution Modal (Requirement 9) */}
      {revertConflict && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0d131f] border-2 border-amber-500/50 rounded-lg max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-amber-400">
              <span className="text-lg">⚠️</span>
              <h3 className="font-bold text-sm uppercase tracking-wider">PATCH REVERT CONFLICT</h3>
            </div>
            <p className="text-xs text-slate-300">
              {revertConflict.conflictMessage}
            </p>
            <div className="p-3 bg-[#111724] border border-[#263147] rounded text-xs space-y-1 font-mono">
              <div className="text-slate-400">File: <span className="text-white">{revertConflict.filePath}</span></div>
              <div className="text-slate-400">Patch: <span className="text-emerald-400">{revertConflict.patch?.id}</span></div>
              <div className="text-amber-300 text-[11px] pt-1">
                Manual changes exist after this patch. You can inspect the diff before deciding.
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => {
                  handleOpenDiff(revertConflict.filePath);
                  setRevertConflict(null);
                }}
                className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs font-semibold transition"
              >
                Inspect Diff
              </button>
              <button
                onClick={() => setRevertConflict(null)}
                className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Keep Manual Changes
              </button>
              <button
                onClick={() => handleRejectPatch(revertConflict.patch, true)}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition"
              >
                Force Revert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LANDING / ENTRY STATE */}
      {isLanding ? (
        <LandingPage
          onSelectEnterpriseDemo={handleSelectEnterpriseDemo}
          onSelectDemo={handleSelectDemo}
          onUploadZip={handleUploadZip}
          onAnalyzeGithub={handleAnalyzeGithub}
          isLoading={isRunning}
          statusMessage={logs[logs.length - 1]}
        />
      ) : (
        /* WORKSPACE SHELL */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Header Bar */}
          <HeaderBar
            repositoryName={session.repository || snapshot?.metadata?.name}
            repositorySource={session.source || repositorySource}
            status={currentStatusLabel}
            onRunAudit={handleTestChanges}
            durationMs={durationMs}
            findingsCount={unifiedFindings.length}
            hasPatches={patches.length > 0}
            allPatchesApplied={patches.length > 0 && patches.every(p => appliedPatchIds.includes(p.id))}
            onApplyAllPatches={handleApplyAllPatches}
            onChangeRepository={handleChangeRepository}
          />

          {/* Workbench Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* Primary Left Navigation */}
            <Sidebar
              activeNav={activeNav}
              onNavigate={(nav) => {
                setActiveNav(nav);
                if (nav === 'findings') {
                  setSelectedFinding(null);
                }
              }}
              repositoryName={session.repository || snapshot?.metadata?.name}
              findingsCount={unifiedFindings.length}
              criticalCount={criticalCount}
              patchesCount={patches.length}
              onChangeRepository={handleChangeRepository}
              onToggleTechnical={() => setIsTechnicalOpen(!isTechnicalOpen)}
              isTechnicalOpen={isTechnicalOpen}
              isRunning={isRunning}
            />

            {/* Center Content Workspace */}
            <CenterWorkspace
              mode={activeNav}
              onModeChange={setActiveNav}
              selectedFinding={currentSelectedFinding}
              onSelectFinding={setSelectedFinding}
              findings={unifiedFindings}
              file={currentFile}
              highlightLine={highlightLine}
              selectedEvidence={selectedEvidence}
              activeFinding={currentSelectedFinding}
              openTabs={openTabs}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
              pipelineResult={session.result}
              snapshot={snapshot}
              baselineSnapshot={baselineSnapshot}
              session={session}
              logs={logs}
              status={currentStatusLabel}
              onRunAudit={handleRunAudit}
              onChangeRepository={handleChangeRepository}
              appliedPatchIds={appliedPatchIds}
              appliedPatchRecords={appliedPatchRecords}
              manualEdits={_manualEdits}
              manualChanges={manualChanges}
              workingRevisionId={workingRevisionId}
              baselineRevisionId={baselineRevisionId}
              testedRevisionId={testedRevisionId}
              isWorkingRevisionVerified={isWorkingRevisionVerified}
              onSaveFile={handleSaveFile}
              onRevertFile={handleRevertFile}
              onResetRepository={handleResetRepository}
              onTestChanges={handleTestChanges}
              testResult={lastVerificationResult}
              verificationTarget={verificationTarget}
              verificationHistory={verificationHistory}
              modifications={modifications}
              onApplyPatch={handleApplyPatch}
              onApplyAllPatches={handleApplyAllPatches}
              onRejectPatch={handleRejectPatch}
              onRevertPatch={handleRejectPatch}
              onReRunVerification={handleTestChanges}
              onJumpToFile={handleJumpToFile}
              targetDiffFile={targetDiffFile}
              onOpenDiff={handleOpenDiff}
              onSelectRun={handleSelectRun}
              currentRunId={currentRunId}
              capabilities={capabilities}
            />
          </div>

          {/* Progressive Disclosure: Technical Drawer */}
          <TechnicalDrawer
            isOpen={isTechnicalOpen}
            onClose={() => setIsTechnicalOpen(false)}
            pipelineResult={session.result}
            logs={logs}
          />

        </div>
      )}
    </div>
  );
}
