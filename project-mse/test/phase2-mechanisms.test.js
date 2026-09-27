import { describe, it, expect } from 'vitest';
import { loadEnterpriseFixture } from '../src/engine/ingest/enterpriseRepository.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { calculateBlastRadius } from '../src/engine/repositoryGraph/blastRadius.js';
import { parseGitHubUrl } from '../src/engine/ingest/githubLoader.js';
import { getUnifiedFindings } from '../src/utils/findingsAdapter.js';
import { saveAnalysisRun, getAnalysisRuns, clearAnalysisRuns } from '../src/utils/sessionManager.js';

describe('Project MSE Phase 2 Mechanisms', () => {
  const snapshot = loadEnterpriseFixture();
  const pipelineResult = runPipeline(snapshot);

  // 1. Evidence Chain & Deterministic "Why?"
  it('constructs structured FindingEvidenceChain and deterministic whyFlagged explanations', () => {
    const findings = getUnifiedFindings(pipelineResult, [], snapshot);
    expect(findings.length).toBeGreaterThan(0);

    const webhookFinding = findings.find(f => f.file.includes('webhooks.ts') || f.title.includes('webhooks/stripe'));
    expect(webhookFinding).toBeDefined();

    // Deterministic explanation based on evidence
    expect(webhookFinding.whyFlagged).toBeDefined();
    expect(webhookFinding.whyFlagged).toContain('webhooks.ts');

    // Evidence chain structure
    const chain = webhookFinding.evidenceChain;
    expect(chain).toBeDefined();
    expect(chain.findingId).toBe(webhookFinding.id);
    expect(chain.sourceEvidence.length).toBeGreaterThan(0);
    expect(chain.verification.checks.length).toBe(5);
    expect(chain.verification.status).toBe('NEEDS_REVIEW');
  });

  // 2. Impact / Blast Radius Analysis
  it('calculates deterministic blast radius from the Alpha repository graph', () => {
    const blastRadius = calculateBlastRadius('src/api/webhooks.ts', pipelineResult.analysis, snapshot);

    expect(blastRadius.isAvailable).toBe(true);
    expect(blastRadius.directlyAffectedFile).toBe('src/api/webhooks.ts');

    // In enterprise fixture, src/server.ts mounts / imports webhooks
    expect(blastRadius.dependents).toContain('src/server.ts');

    // In enterprise fixture, webhooks.ts calls ledger.ts
    expect(blastRadius.dependencies).toContain('src/core/ledger.ts');

    // Impact chain should show the propagation
    expect(blastRadius.impactChain.length).toBeGreaterThan(1);
    expect(blastRadius.impactChain).toContain('src/api/webhooks.ts');
  });

  it('gracefully reports unavailable impact graph when no edges exist', () => {
    const blastRadius = calculateBlastRadius('README.md', pipelineResult.analysis, snapshot);
    expect(blastRadius.isAvailable).toBe(false);
    expect(blastRadius.summary).toBe('Impact graph unavailable for this finding.');
  });

  // 3. GitHub URL Parsing & Ingestion Validation
  it('validates and extracts owner and repository from GitHub URLs', () => {
    const res = parseGitHubUrl('https://github.com/expressjs/express');
    expect(res.owner).toBe('expressjs');
    expect(res.repo).toBe('express');
    expect(res.normalizedUrl).toBe('https://github.com/expressjs/express');

    const resWithGit = parseGitHubUrl('https://github.com/facebook/react.git');
    expect(resWithGit.owner).toBe('facebook');
    expect(resWithGit.repo).toBe('react');

    expect(() => parseGitHubUrl('invalid-url')).toThrow('Invalid GitHub URL format');
    expect(() => parseGitHubUrl('https://gitlab.com/owner/repo')).toThrow('Invalid GitHub URL format');
  });

  // 4. Analysis Sessions & Product Memory
  it('persists and retrieves analysis runs', () => {
    clearAnalysisRuns();

    const run = saveAnalysisRun({
      id: 'RUN #001',
      repositoryName: 'enterprise-payment-core',
      repositorySource: 'demo',
      durationMs: 25,
      filesCount: 9,
      findingsCount: 10,
      counterexamplesCount: 4,
      patchesCount: 4,
      verificationOutcome: 'VERIFIED',
      snapshot,
      pipelineResult
    });

    expect(run.id).toBe('RUN #001');

    const history = getAnalysisRuns();
    expect(history.length).toBe(1);
    expect(history[0].repositoryName).toBe('enterprise-payment-core');
    expect(history[0].findingsCount).toBe(10);
  });

  // 5. Upgraded Report Verification
  it('generates report containing Run ID, Evidence Chains, Blast Radius, and Verification Gate', () => {
    const report = pipelineResult.report;
    expect(report).toBeDefined();
    expect(report.markdown).toContain('Verification Gate');
    expect(report.markdown).toContain('Impact / Blast Radius');
    expect(report.json.summary.verificationGate).toBeDefined();
  });
});
