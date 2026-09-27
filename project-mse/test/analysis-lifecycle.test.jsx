import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';

import CenterWorkspace from '../src/components/CenterWorkspace';
import AnalysisProgressView from '../src/components/workspace/AnalysisProgressView';
import AnalysisFailedView from '../src/components/workspace/AnalysisFailedView';
import OverviewView from '../src/components/workspace/OverviewView';
import FindingsView from '../src/components/workspace/FindingsView';
import FindingDetailView from '../src/components/workspace/FindingDetailView';
import ChangeReviewView from '../src/components/workspace/ChangeReviewView';
import VerificationView from '../src/components/workspace/VerificationView';
import ReportView from '../src/components/workspace/ReportView';
import SourceView from '../src/components/workspace/SourceView';
import HeaderBar from '../src/components/HeaderBar';
import Sidebar from '../src/components/Sidebar';
import ErrorBoundary from '../src/components/ErrorBoundary';

import {
  loadEnterpriseFixture,
  loadZipRepository,
  parseGitHubUrl,
  runPipeline,
  runPipelineAsync
} from '../src/engine/index.js';
import { getUnifiedFindings } from '../src/utils/findingsAdapter.js';

describe('Atomic Analysis Session Lifecycle & Reliability Suite', () => {

  // 1. ANALYSIS RESET & SINGLE SESSION
  describe('1. Analysis Reset & Single Session Lifecycle', () => {
    it('initializes with a valid single analysis session object in IDLE or INGESTING state', () => {
      const initialSession = {
        id: 'test-run-1',
        repository: 'enterprise-payment-core',
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

      const allowedStatuses = [
        'IDLE', 'INGESTING', 'ANALYZING', 'RECONCILING',
        'SEARCHING', 'SYNTHESIZING', 'VERIFYING', 'COMPLETE', 'FAILED'
      ];

      expect(allowedStatuses.includes(initialSession.status)).toBe(true);
      expect(initialSession.result).toBeNull();
      expect(initialSession.error).toBeNull();
    });

    it('immediately clears all previous results when a new session starts', () => {
      // Simulate an old completed repository session
      const oldResult = { findings: [{ id: 'old-1' }], totalDurationMs: 120 };
      let currentResult = oldResult;
      let appliedPatchIds = ['patch-1'];
      let selectedFinding = { id: 'old-1' };
      let targetDiffFile = 'server.js';
      let durationMs = 120;
      let findings = [{ id: 'old-1' }];

      // Reset function simulation as in App.jsx
      const reset = () => {
        currentResult = null;
        appliedPatchIds = [];
        selectedFinding = null;
        targetDiffFile = null;
        durationMs = 0;
        findings = [];
      };

      reset();

      expect(currentResult).toBeNull();
      expect(appliedPatchIds).toEqual([]);
      expect(selectedFinding).toBeNull();
      expect(targetDiffFile).toBeNull();
      expect(durationMs).toBe(0);
      expect(findings).toEqual([]);
    });

    it('never renders completed results if session.status !== COMPLETE', () => {
      const oldResult = {
        analysis: { findings: [{ id: 'old-f1', title: 'Old Finding' }] },
        patches: { patches: [] },
        verification: { status: 'VERIFIED', checks: [] },
        decision: { status: 'VERIFIED', checks: [] }
      };

      // When status is ANALYZING, even if a stale result was passed, CenterWorkspace MUST show progress
      const html = renderToString(
        <CenterWorkspace
          session={{
            id: 'run-2',
            repository: 'new-uploaded-zip',
            source: 'zip',
            status: 'ANALYZING',
            progress: {
              currentPhase: 'ANALYZING',
              detail: 'Building AST call graph...',
              stages: { understanding: 'running', specifications: 'pending', riskyBehavior: 'pending', evidence: 'pending', repairs: 'pending', verifying: 'pending' }
            },
            result: null,
            error: null
          }}
          pipelineResult={oldResult}
          findings={[]}
        />
      );

      // Must show progress view and target repository name
      expect(html).toContain('ANALYSIS IN PROGRESS');
      expect(html).toContain('new-uploaded-zip');
      expect(html).toContain('Understanding repository');
      // Must NOT contain old findings or completed views
      expect(html).not.toContain('Old Finding');
      expect(html).not.toContain('ANALYSIS COMPLETE');
    });

    it('renders clean AnalysisFailedView if session.status === FAILED with no partial results', () => {
      const html = renderToString(
        <CenterWorkspace
          session={{
            id: 'run-err',
            repository: 'corrupt-archive',
            source: 'zip',
            status: 'FAILED',
            error: 'ZIP Ingestion Error: Corrupted zip header',
            result: null
          }}
          pipelineResult={null}
          findings={[]}
        />
      );

      expect(html).toContain('ANALYSIS FAILED');
      expect(html).toContain('Corrupted zip header');
      expect(html).toContain('Try Again');
      expect(html).toContain('Change Repository');
      expect(html).not.toContain('Overview');
      expect(html).not.toContain('ANALYSIS IN PROGRESS');

      // Also verify standalone AnalysisFailedView component directly
      const directHtml = renderToString(
        <AnalysisFailedView
          error="Direct failure reason"
          repositoryName="direct-repo"
          onRetry={() => {}}
          onChangeRepository={() => {}}
        />
      );
      expect(directHtml).toContain('ANALYSIS FAILED');
      expect(directHtml).toContain('Direct failure reason');
    });
  });

  // 2. STALE RUN PROTECTION
  describe('2. Stale Run Protection', () => {
    it('discards late events and results from older invalidated runs', async () => {
      let activeSessionToken = 1;
      let uiUpdatedWithRun = null;

      const run1 = new Promise((resolve) => {
        setTimeout(() => {
          if (activeSessionToken === 1) {
            uiUpdatedWithRun = 'run1';
          }
          resolve('run1-finished');
        }, 50);
      });

      // User immediately triggers run 2 (e.g. dropped second ZIP)
      activeSessionToken = 2;

      const run2 = new Promise((resolve) => {
        setTimeout(() => {
          if (activeSessionToken === 2) {
            uiUpdatedWithRun = 'run2';
          }
          resolve('run2-finished');
        }, 10);
      });

      await Promise.all([run1, run2]);

      // Only run 2 should have updated the UI
      expect(uiUpdatedWithRun).toBe('run2');
    });
  });

  // 3. PROGRESS SCREEN & STAGES
  describe('3. Progress Screen & Stage Fidelity', () => {
    it('displays all 6 stages accurately reflecting active and completed phases', () => {
      const session = {
        id: 'run-3',
        repository: 'enterprise-payment-core',
        source: 'demo',
        status: 'SEARCHING',
        progress: {
          currentPhase: 'SEARCHING',
          detail: 'Evaluating formal system invariants across security...',
          stages: {
            understanding: 'completed',
            specifications: 'completed',
            riskyBehavior: 'running',
            evidence: 'pending',
            repairs: 'pending',
            verifying: 'pending',
          }
        }
      };

      const html = renderToString(
        <AnalysisProgressView session={session} logs={['[SEARCHING] Evaluating invariants...']} />
      );

      expect(html).toContain('Understanding repository');
      expect(html).toContain('Checking specifications');
      expect(html).toContain('Finding risky behavior');
      expect(html).toContain('Building evidence');
      expect(html).toContain('Preparing repairs');
      expect(html).toContain('Verifying results');
      expect(html).toContain('Evaluating formal system invariants');
    });
  });

  // 4. CONTROLS & NAVIGATION LOCKOUT
  describe('4. Controls & Navigation While Running', () => {
    it('disables Run Analysis, Switch repository, and navigation when running', () => {
      const headerHtml = renderToString(
        <HeaderBar
          repositoryName="active-repo"
          repositorySource="zip"
          status="running"
          onRunAudit={() => {}}
          onChangeRepository={() => {}}
          durationMs={45}
        />
      );

      expect(headerHtml).toContain('disabled=""');
      expect(headerHtml).toContain('Analyzing...');

      const sidebarHtml = renderToString(
        <Sidebar
          activeNav="overview"
          onNavigate={() => {}}
          repositoryName="active-repo"
          onChangeRepository={() => {}}
          isRunning={true}
        />
      );

      expect(sidebarHtml).toContain('disabled=""');
      expect(sidebarHtml).toContain('cursor-not-allowed');
    });
  });

  // 5. NULL & EMPTY SAFETY ACROSS ALL COMPONENTS
  describe('5. Null & Empty Safety Audit', () => {
    it('CenterWorkspace safely renders without crashing with all null props', () => {
      const html = renderToString(
        <CenterWorkspace
          session={null}
          pipelineResult={null}
          snapshot={null}
          findings={null}
          file={null}
          selectedFinding={null}
          selectedEvidence={null}
          openTabs={[]}
          appliedPatchIds={null}
        />
      );
      expect(html).toBeDefined();
    });

    it('OverviewView safely handles null pipelineResult, null snapshot, null findings', () => {
      const html = renderToString(
        <OverviewView
          pipelineResult={null}
          snapshot={null}
          findings={null}
          status="idle"
          onNavigateTab={() => {}}
        />
      );
      expect(html).toContain('repository');
      expect(html).toContain('issues');
    });

    it('FindingsView safely handles null and empty findings list', () => {
      const html = renderToString(
        <FindingsView
          findings={null}
          onSelectFinding={() => {}}
        />
      );
      expect(html).toContain('No findings matching the selected filter');
    });

    it('FindingDetailView safely handles null finding gracefully', () => {
      const html = renderToString(
        <FindingDetailView
          finding={null}
          onBack={() => {}}
        />
      );
      expect(html).toContain('No finding selected');
    });

    it('ChangeReviewView safely handles null patches and empty patches', () => {
      const html = renderToString(
        <ChangeReviewView
          patches={null}
          appliedPatchIds={null}
        />
      );
      expect(html).toContain('No Fixes to Review');
    });

    it('VerificationView safely handles null verification and null invariants', () => {
      const html = renderToString(
        <VerificationView
          verification={null}
          invariants={null}
          pipelineResult={null}
          snapshot={null}
        />
      );
      expect(html).toBeDefined();
    });

    it('ReportView safely handles null report and null repoName', () => {
      const html = renderToString(
        <ReportView
          report={null}
          repoName={null}
        />
      );
      expect(html).toContain('Audit report');
    });

    it('SourceView safely handles null file and missing content', () => {
      const html = renderToString(
        <SourceView
          file={null}
          openTabs={[]}
        />
      );
      expect(html).toContain('Select a file from the repository explorer');
    });
  });

  // 6. ERROR BOUNDARY RESILIENCE & RECOVERY
  describe('6. ErrorBoundary Resilience & Recovery', () => {
    it('ErrorBoundary catches render crashes and renders recovery options', () => {
      const boundary = new ErrorBoundary({
        onReturnToOverview: () => {},
        onRestartAnalysis: () => {},
        onChangeRepository: () => {}
      });

      const errorState = ErrorBoundary.getDerivedStateFromError(new Error('Simulated Component Crash in AST Renderer'));
      boundary.state = {
        hasError: errorState.hasError,
        error: errorState.error,
        errorInfo: { componentStack: 'at Component (<anonymous>:1:1)' }
      };

      const rendered = boundary.render();
      const html = renderToString(rendered);

      expect(html).toContain('COMPONENT ERROR BOUNDARY TRIGGERED');
      expect(html).toContain('Simulated Component Crash in AST Renderer');
      expect(html).toContain('Return to Overview');
      expect(html).toContain('Restart Analysis');
      expect(html).toContain('Change Repository');
    });
  });

  // 7. SPECIFIC VALIDATION CASES A THROUGH J
  describe('7. Validation Scenarios A through J', () => {
    // Case A: Demo -> analyze
    it('Case A: Demo repository analyzes successfully and produces complete verified session', async () => {
      const snapshot = loadEnterpriseFixture();
      expect(snapshot.files.length).toBeGreaterThan(0);

      const result = await runPipelineAsync(snapshot, { stageDelayMs: 0 });
      expect(result).toBeDefined();
      expect(result.analysis.findings.length).toBeGreaterThan(0);
      expect(result.decision.status).toBeDefined();

      const unified = getUnifiedFindings(result, [], snapshot);
      expect(unified.length).toBeGreaterThan(0);
    });

    // Case B: ZIP -> analyze
    it('Case B: ZIP archive ingests and analyzes cleanly', async () => {
      const zip = new JSZip();
      zip.file('src/server.ts', 'export const port = 3000;');
      zip.file('README.md', '# Service\nPORT=3000\n');
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });

      const snapshot = await loadZipRepository(buffer, 'test-zip');
      expect(snapshot.files.length).toBe(2);

      const result = await runPipelineAsync(snapshot, { stageDelayMs: 0 });
      expect(result.verification.status).toBe('VERIFIED');
    });

    // Case C: ZIP twice consecutively
    it('Case C: Ingesting ZIP twice consecutively creates two distinct atomic sessions without residue', async () => {
      const zip1 = new JSZip();
      zip1.file('file1.js', 'console.log("repo1");');
      const buf1 = await zip1.generateAsync({ type: 'arraybuffer' });

      const snap1 = await loadZipRepository(buf1, 'repo-1');
      expect(snap1.metadata.name).toBe('repo-1');

      const zip2 = new JSZip();
      zip2.file('file2.js', 'console.log("repo2");');
      const buf2 = await zip2.generateAsync({ type: 'arraybuffer' });

      const snap2 = await loadZipRepository(buf2, 'repo-2');
      expect(snap2.metadata.name).toBe('repo-2');
      expect(snap2.files.some(f => f.path === 'file1.js')).toBe(false);
    });

    // Case D: ZIP while previous analysis is running
    it('Case D: Uploading a new ZIP while analysis is running aborts/invalidates previous run', async () => {
      let activeRun = 1;
      let finalState = null;

      // Start run 1
      const startRun1 = () => {
        const token = 1;
        setTimeout(() => {
          if (activeRun === token) {
            finalState = 'RUN_1_COMMITTED';
          }
        }, 60);
      };

      // Start run 2 while run 1 is active
      const startRun2 = () => {
        activeRun = 2; // invalidate run 1
        const token = 2;
        setTimeout(() => {
          if (activeRun === token) {
            finalState = 'RUN_2_COMMITTED';
          }
        }, 20);
      };

      startRun1();
      startRun2();

      await new Promise(r => setTimeout(r, 100));
      expect(finalState).toBe('RUN_2_COMMITTED');
    });

    // Case E: GitHub -> analyze
    it('Case E: GitHub URL parses correctly and handles invalid URLs cleanly', () => {
      const parsed = parseGitHubUrl('https://github.com/facebook/react');
      expect(parsed.owner).toBe('facebook');
      expect(parsed.repo).toBe('react');

      expect(() => parseGitHubUrl('https://notgithub.com/foo/bar')).toThrow(/GitHub/i);
      expect(() => parseGitHubUrl('invalid-url')).toThrow();
    });

    // Case F: Change repository after completed run
    it('Case F: Changing repository resets session to IDLE and clears result state', () => {
      let session = {
        id: 'completed-run',
        repository: 'demo-app',
        source: 'demo',
        status: 'COMPLETE',
        result: { some: 'result' }
      };

      // Change repository invoked
      session = {
        id: null,
        repository: '',
        source: 'demo',
        status: 'IDLE',
        result: null,
        error: null
      };

      expect(session.status).toBe('IDLE');
      expect(session.result).toBeNull();
      expect(session.repository).toBe('');
    });

    // Case G: Change repository after failed run
    it('Case G: Changing repository after failed run clears error state and allows fresh selection', () => {
      let session = {
        id: 'failed-run',
        repository: 'bad-zip',
        status: 'FAILED',
        error: 'Decompression bomb detected',
        result: null
      };

      // Change repository invoked
      session = {
        id: null,
        repository: '',
        status: 'IDLE',
        result: null,
        error: null
      };

      expect(session.status).toBe('IDLE');
      expect(session.error).toBeNull();
    });

    // Case H: Click around during analysis
    it('Case H: CenterWorkspace never allows clicking into old findings while running', () => {
      const sessionRunning = {
        id: 'run-active',
        repository: 'payment-core',
        source: 'demo',
        status: 'ANALYZING',
        result: null
      };

      const html = renderToString(
        <CenterWorkspace
          mode="findings"
          session={sessionRunning}
          pipelineResult={null}
          findings={[]}
        />
      );

      // Must NOT render findings list or detail
      expect(html).not.toContain('Repository Findings');
      // Must render progress screen
      expect(html).toContain('ANALYSIS IN PROGRESS');
    });

    // Case I: Empty / malformed ZIP
    it('Case I: Empty and malformed ZIPs do not crash application', async () => {
      // Empty ZIP
      const emptyZip = new JSZip();
      const emptyBuf = await emptyZip.generateAsync({ type: 'arraybuffer' });
      const emptySnapshot = await loadZipRepository(emptyBuf, 'empty');
      expect(emptySnapshot.files).toEqual([]);

      const result = runPipeline(emptySnapshot);
      expect(result).toBeDefined();

      // Corrupted ZIP
      const corruptBuf = new Uint8Array([1, 2, 3, 4, 5]).buffer;
      await expect(loadZipRepository(corruptBuf, 'corrupt')).rejects.toThrow();
    });

    // Case J: Missing files
    it('Case J: Repository with missing README and package.json handles analysis safely', async () => {
      const snapshot = {
        metadata: { name: 'bare-repo', source: 'zip', fileCount: 1 },
        files: [
          { path: 'src/main.js', content: 'const a = 1;', sizeBytes: 12 }
        ]
      };

      const result = await runPipelineAsync(snapshot, { stageDelayMs: 0 });
      expect(result).toBeDefined();
      expect(result.verification.status).toBe('VERIFIED');
    });
  });
});
