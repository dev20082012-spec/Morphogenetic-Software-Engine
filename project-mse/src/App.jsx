import React, { useState, useEffect, useRef } from 'react';
import HeaderBar from './components/HeaderBar';
import FileTree from './components/FileTree';
import CodeEditor from './components/CodeEditor';
import InvariantInspector from './components/InvariantInspector';
import VerificationConsole from './components/VerificationConsole';

import { 
  REPOSITORY_FILES, 
  UNIFIED_DIFFS, 
  SYSTEM_INVARIANTS, 
  AST_PIPELINE_PASSES 
} from './data/mockFiles';

export default function App() {
  const [selectedPreset, setSelectedPreset] = useState('payment');

  const [activeFilePath, setActiveFilePath] = useState('src/routes/webhook.js');
  const [openTabs, setOpenTabs] = useState([
    'src/routes/webhook.js',
    'src/db/pool.js',
    'specs/README.md',
    'cegis-antigens/INV-001.antigen.test.js'
  ]);
  const [viewMode, setViewMode] = useState('code');
  const [highlightLine, setHighlightLine] = useState(null);
  const [selectedAstNode, setSelectedAstNode] = useState(null);

  const [selectedInvariant, setSelectedInvariant] = useState(SYSTEM_INVARIANTS[0]);

  const [status, setStatus] = useState('idle');
  const [currentPass, setCurrentPass] = useState(1);
  const [consoleExpanded, setConsoleExpanded] = useState(true);
  const [logs, setLogs] = useState([
    '[00:00.00] [ORCHESTRATOR] Initialized Project MSE IDE Workbench.',
    '[00:00.12] [SECURITY_SHIELD] Ingesting repository topology in ephemeral RAM...',
    '[00:00.45] [ALPHA:MORPHOLOGIST] AST parse initiated: 12 source modules indexed.',
    '[00:01.02] [ALPHA:MORPHOLOGIST] Latent state manifold extracted: 4 invariants bound.',
    '[00:01.48] [BETA:SYMBIOTE] Parsed specs/README.md and specs/openapi.yaml.',
    '[00:01.95] [BETA:SYMBIOTE] Epigenetic Drift detected: Service port 3000 vs 8080 in AST.',
    '[00:02.40] [GAMMA:IMMUNE] Synthesized counterexample test: cegis-antigens/INV-001.antigen.test.js [RED].',
    '[00:02.88] [GAMMA:IMMUNE] Vulnerability isolated: unauthenticated webhook execution.',
    '[00:03.20] [GAMMA:IMMUNE] Minimal atomic patch synthesized: PR #142 (AUTH_GUARD_INSERTION).'
  ]);

  const [energyScore, setEnergyScore] = useState(6.371);

  const intervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleSelectFile = (filePath) => {
    setActiveFilePath(filePath);
    if (!openTabs.includes(filePath)) {
      setOpenTabs(prev => [...prev, filePath]);
    }
    setHighlightLine(null);
    setSelectedAstNode(null);
    if (viewMode === 'diff' && !UNIFIED_DIFFS[filePath]) {
      setViewMode('code');
    }
  };

  const handleSelectTab = (tabPath) => {
    setActiveFilePath(tabPath);
    setHighlightLine(null);
    setSelectedAstNode(null);
  };

  const handleCloseTab = (tabPath) => {
    const updated = openTabs.filter(p => p !== tabPath);
    setOpenTabs(updated);
    if (activeFilePath === tabPath) {
      setActiveFilePath(updated[0] || 'src/routes/webhook.js');
    }
  };

  const handleSelectDiff = (filePath) => {
    handleSelectFile(filePath);
    setViewMode('diff');
  };

  const handleJumpToInvariant = (invariant) => {
    setSelectedInvariant(invariant);
    handleSelectFile(invariant.targetFile);
    setViewMode('code');
    setHighlightLine(invariant.line);
    setSelectedAstNode(invariant);
  };

  const handleRunVerification = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus('running');
    setCurrentPass(1);
    setConsoleExpanded(true);

    const runLogs = [
      '[00:00.05] [EXEC] Starting CEGIS Loop Verification across 12 AST modules...',
      '[00:00.22] [PASS 1] Pre-Flight Sanitizer: 0 plaintext credentials found. Salted HMAC check OK.',
      '[00:00.58] [PASS 2] Morphologist Call-Graph: Traversed 42 AST call nodes, extracted 3 invariants.',
      '[00:00.95] [PASS 3] Symbiote Reconciler: Ingested OpenAPI spec, verified drift reconciliation.',
      '[00:01.40] [PASS 4] Immune Core: Running counterexample test cegis-antigens/INV-001.antigen.test.js...',
      '[00:01.85] [PASS 4] TEST FAILING (RED): Precondition violated on missing X-Hub-Signature-256.',
      '[00:02.20] [PASS 5] Synthesizing AST repair patch with AUTH_GUARD_INSERTION strategy...',
      '[00:02.65] [PASS 5] Generated unified diff patch: PR #142 (Confidence: 99.8%).',
      '[00:03.10] [PASS 5] Re-executing counterexample test against patched AST...',
      '[00:03.50] [PASS 5] TEST PASSING (GREEN): Homeostasis achieved. System Energy delta: -0.450 E(S).',
      '[00:03.80] [ORCHESTRATOR] CEGIS Verification complete: 100% INVARIANTS BOUND, ZERO ENTROPY.'
    ];

    setLogs([]);
    let logIdx = 0;

    intervalRef.current = setInterval(() => {
      if (logIdx < runLogs.length) {
        const nextLog = runLogs[logIdx];
        setLogs(prev => [...prev, nextLog]);
        
        if (logIdx === 1) setCurrentPass(1);
        if (logIdx === 2) setCurrentPass(2);
        if (logIdx === 3) setCurrentPass(3);
        if (logIdx === 5) setCurrentPass(4);
        if (logIdx === 7) setCurrentPass(5);

        logIdx++;
      } else {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setStatus('converged');
        setEnergyScore(5.921);
      }
    }, 350);
  };

  const handleStepPass = () => {
    if (currentPass < AST_PIPELINE_PASSES.length) {
      const next = currentPass + 1;
      setCurrentPass(next);
      const passInfo = AST_PIPELINE_PASSES[next - 1];
      setLogs(prev => [
        ...prev,
        `[STEP] Executed Pass ${passInfo.pass}: ${passInfo.name} (${passInfo.duration}, ${passInfo.tokensAllocated})`
      ]);
      if (next === AST_PIPELINE_PASSES.length) {
        setStatus('converged');
        setEnergyScore(5.921);
      }
    }
  };

  const handleReset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus('idle');
    setCurrentPass(1);
    setEnergyScore(6.371);
    setHighlightLine(null);
    setSelectedAstNode(null);
    setLogs([
      '[00:00.00] [ORCHESTRATOR] Workbench reset to baseline AST state.'
    ]);
  };

  const currentFile = REPOSITORY_FILES[activeFilePath] || REPOSITORY_FILES['src/routes/webhook.js'];
  const currentDiff = UNIFIED_DIFFS[activeFilePath] || null;

  return (
    <div className="h-screen max-h-screen w-screen bg-[#090d16] text-slate-100 flex flex-col font-sans overflow-hidden">
      <HeaderBar 
        selectedPreset={selectedPreset}
        onSelectPreset={setSelectedPreset}
        energyScore={energyScore}
        status={status}
      />

      <div className="flex-1 flex overflow-hidden">
        <FileTree 
          files={REPOSITORY_FILES}
          activeFile={activeFilePath}
          onSelectFile={handleSelectFile}
          activeDiffFile={viewMode === 'diff' ? activeFilePath : null}
          onSelectDiff={handleSelectDiff}
        />

        <CodeEditor 
          file={currentFile}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          diffData={currentDiff}
          highlightLine={highlightLine}
          selectedAstNode={selectedAstNode}
          openTabs={openTabs}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
        />

        <InvariantInspector 
          invariants={SYSTEM_INVARIANTS}
          selectedInvariant={selectedInvariant}
          onJumpToInvariant={handleJumpToInvariant}
          onOpenDiff={handleSelectDiff}
        />
      </div>

      <VerificationConsole 
        status={status}
        currentPass={currentPass}
        passes={AST_PIPELINE_PASSES}
        logs={logs}
        onRunVerification={handleRunVerification}
        onStepPass={handleStepPass}
        onReset={handleReset}
        isExpanded={consoleExpanded}
        onToggleExpand={() => setConsoleExpanded(!consoleExpanded)}
      />
    </div>
  );
}
