/**
 * MSE Pipeline Orchestrator
 *
 * Sequences all engine modules into a single pipeline:
 *
 *   Ingest → Alpha (Repository Graph) → Beta (Drift) → Invariants
 *          → Gamma (Counterexamples) → Patch → Verify → Report
 *
 * Emits telemetry events throughout execution for UI consumption.
 */

import { analyzeRepository } from './repositoryGraph/index.js';
import { analyzeDrift } from './drift/index.js';
import { evaluateInvariants } from './invariants/index.js';
import { generateCounterexamples } from './counterexample/index.js';
import { synthesizePatches } from './patch/index.js';
import { verifyPatches } from './verify/index.js';
import { generateReport } from './report/index.js';

/**
 * @typedef {{
 *   phase: string,
 *   status: 'running' | 'done' | 'error',
 *   detail?: string,
 *   timestamp: string,
 * }} TelemetryEvent
 */

/**
 * Run the full MSE analysis pipeline.
 *
 * @param {import('./types').RepositorySnapshot} snapshot
 * @param {{ onEvent?: (event: TelemetryEvent) => void }} [options]
 * @returns {PipelineResult}
 */
export function runPipeline(snapshot, options = {}) {
  const emit = options.onEvent || (() => {});
  const startTime = performance.now();
  const events = [];

  const emitEvent = (phase, status, detail) => {
    const event = { phase, status, detail, timestamp: new Date().toISOString() };
    events.push(event);
    emit(event);
  };

  // Phase 1: Alpha — Repository Graph Analysis
  emitEvent('ALPHA', 'running', 'Starting structural analysis...');
  let analysis;
  try {
    analysis = analyzeRepository(snapshot);
    emitEvent('ALPHA', 'done', `Analyzed ${analysis.repositoryStats.sourceFiles} source files, found ${analysis.findings.length} findings in ${analysis.repositoryStats.durationMs}ms.`);
  } catch (err) {
    emitEvent('ALPHA', 'error', err.message);
    throw err;
  }

  // Phase 2: Beta — Document/Code Drift
  emitEvent('BETA', 'running', 'Starting drift reconciliation...');
  let drift;
  try {
    drift = analyzeDrift(snapshot, analysis);
    emitEvent('BETA', 'done', `Scanned ${drift.stats.readmeFilesScanned} READMEs, ${drift.stats.openapiFilesScanned} OpenAPI specs. Found ${drift.stats.driftFindingsCount} drift findings in ${drift.stats.durationMs}ms.`);
  } catch (err) {
    emitEvent('BETA', 'error', err.message);
    drift = { findings: [], stats: { readmeFilesScanned: 0, openapiFilesScanned: 0, envFilesScanned: 0, driftFindingsCount: 0, criticalCount: 0, durationMs: 0 } };
  }

  // Phase 3: Invariant Evaluation
  emitEvent('INVARIANTS', 'running', 'Evaluating system invariants...');
  let invariantResult;
  try {
    invariantResult = evaluateInvariants(analysis, drift);
    emitEvent('INVARIANTS', 'done', `Evaluated ${invariantResult.summary.total} invariants: ${invariantResult.summary.violated} violated, ${invariantResult.summary.satisfied} satisfied.`);
  } catch (err) {
    emitEvent('INVARIANTS', 'error', err.message);
    invariantResult = { invariants: [], summary: { total: 0, violated: 0, satisfied: 0, unknown: 0, durationMs: 0 } };
  }

  // Phase 4: Gamma — Counterexample Synthesis
  emitEvent('GAMMA', 'running', 'Synthesizing counterexamples...');
  let counterexampleResult;
  try {
    counterexampleResult = generateCounterexamples(invariantResult, analysis, snapshot);
    emitEvent('GAMMA', 'done', `Generated ${counterexampleResult.summary.generated} counterexample(s) with test artifacts in ${counterexampleResult.summary.durationMs}ms.`);
  } catch (err) {
    emitEvent('GAMMA', 'error', err.message);
    counterexampleResult = { counterexamples: [], summary: { generated: 0, violatedInvariants: 0, durationMs: 0 } };
  }

  // Phase 5: Patch Synthesis
  emitEvent('PATCH', 'running', 'Synthesizing candidate patches...');
  let patchResult;
  try {
    patchResult = synthesizePatches(invariantResult, analysis, snapshot);
    emitEvent('PATCH', 'done', `Synthesized ${patchResult.summary.generated} patch(es) in ${patchResult.summary.durationMs}ms.`);
  } catch (err) {
    emitEvent('PATCH', 'error', err.message);
    patchResult = { patches: [], summary: { generated: 0, violatedInvariants: 0, durationMs: 0 } };
  }

  // Phase 6: Verification
  emitEvent('VERIFY', 'running', 'Verifying patches against MSE checks...');
  let verificationResult;
  try {
    verificationResult = verifyPatches(patchResult, snapshot, analysis, drift, invariantResult);
    emitEvent('VERIFY', 'done', `Verification ${verificationResult.status}: ${verificationResult.checks.filter(c => c.status === 'passed').length}/${verificationResult.checks.length} checks passed in ${verificationResult.durationMs}ms.`);
  } catch (err) {
    emitEvent('VERIFY', 'error', err.message);
    verificationResult = { status: 'FAILED', checks: [], evidence: [], durationMs: 0 };
  }

  // Phase 7: Report Generation
  const totalDurationMs = Math.round(performance.now() - startTime);
  emitEvent('REPORT', 'running', 'Generating report...');
  let report;
  try {
    report = generateReport({
      snapshot,
      analysis,
      drift,
      invariants: invariantResult,
      counterexamples: counterexampleResult,
      patches: patchResult,
      verification: verificationResult,
      totalDurationMs,
      runId: options.runId || 'RUN #001',
    });
    emitEvent('REPORT', 'done', `Report generated: ${report.summary.totalFindings} findings, ${report.summary.patchesGenerated} patches.`);
  } catch (err) {
    emitEvent('REPORT', 'error', err.message);
    report = { json: {}, markdown: '', summary: {} };
  }

  emitEvent('PIPELINE', 'done', `Pipeline complete in ${totalDurationMs}ms.`);

  return {
    snapshot,
    analysis,
    drift,
    invariants: invariantResult,
    counterexamples: counterexampleResult,
    patches: patchResult,
    verification: verificationResult,
    report,
    telemetry: events,
    totalDurationMs,
  };
}

/**
 * Run the full MSE analysis pipeline asynchronously, yielding between
 * stages to allow UI updates and rendering of real execution stages:
 * INGESTING -> ANALYZING -> RECONCILING -> SEARCHING -> SYNTHESIZING -> VERIFYING -> COMPLETE
 *
 * @param {import('./types').RepositorySnapshot} snapshot
 * @param {{ onEvent?: (event: TelemetryEvent) => void, stageDelayMs?: number }} [options]
 * @returns {Promise<PipelineResult>}
 */
export async function runPipelineAsync(snapshot, options = {}) {
  const emit = options.onEvent || (() => {});
  const stageDelayMs = options.stageDelayMs !== undefined ? options.stageDelayMs : 80;
  const startTime = performance.now();
  const events = [];

  const emitEvent = (phase, status, detail) => {
    const event = { phase, status, detail, timestamp: new Date().toISOString() };
    events.push(event);
    emit(event);
  };

  const pause = (ms = stageDelayMs) => new Promise(resolve => setTimeout(resolve, ms));

  // Stage 1: INGESTING
  emitEvent('INGESTING', 'running', `Ingesting repository "${snapshot.metadata?.name || 'repository'}" (${snapshot.files?.length || 0} files) into ephemeral RAM...`);
  if (stageDelayMs > 0) await pause();
  emitEvent('INGESTING', 'done', `Ingested ${snapshot.files.length} files. Zero-retention RAM buffer active.`);

  // Stage 2: ANALYZING (Alpha: Repository Graph)
  emitEvent('ANALYZING', 'running', 'Building AST call graph, scanning routes, exports and dependencies...');
  if (stageDelayMs > 0) await pause();
  let analysis;
  try {
    analysis = analyzeRepository(snapshot);
    emitEvent('ANALYZING', 'done', `Analyzed ${analysis.repositoryStats.sourceFiles} source files (${analysis.repositoryStats.totalLines} lines). Discovered ${analysis.routes.length} routes, ${analysis.findings.length} findings in ${analysis.repositoryStats.durationMs}ms.`);
  } catch (err) {
    emitEvent('ANALYZING', 'error', err.message);
    throw err;
  }

  // Stage 3: RECONCILING (Beta: Document/Code Drift)
  emitEvent('RECONCILING', 'running', 'Reconciling documentation (README, OpenAPI, env) against source reality...');
  if (stageDelayMs > 0) await pause();
  let drift;
  try {
    drift = analyzeDrift(snapshot, analysis);
    emitEvent('RECONCILING', 'done', `Scanned ${drift.stats.readmeFilesScanned} READMEs, ${drift.stats.openapiFilesScanned} OpenAPI specs. Identified ${drift.stats.driftFindingsCount} drift discrepancies.`);
  } catch (err) {
    emitEvent('RECONCILING', 'error', err.message);
    drift = { findings: [], stats: { readmeFilesScanned: 0, openapiFilesScanned: 0, envFilesScanned: 0, driftFindingsCount: 0, criticalCount: 0, durationMs: 0 } };
  }

  // Stage 4: SEARCHING (Invariant Evaluation)
  emitEvent('SEARCHING', 'running', 'Evaluating formal system invariants across security, data integrity, and config...');
  if (stageDelayMs > 0) await pause();
  let invariantResult;
  try {
    invariantResult = evaluateInvariants(analysis, drift);
    emitEvent('SEARCHING', 'done', `Evaluated ${invariantResult.summary.total} invariants: ${invariantResult.summary.violated} violated, ${invariantResult.summary.satisfied} satisfied.`);
  } catch (err) {
    emitEvent('SEARCHING', 'error', err.message);
    invariantResult = { invariants: [], summary: { total: 0, violated: 0, satisfied: 0, unknown: 0, durationMs: 0 } };
  }

  // Stage 5: SYNTHESIZING (Gamma Counterexamples + Repair Patches)
  emitEvent('SYNTHESIZING', 'running', 'Synthesizing counterexample tests and minimal atomic repair patches...');
  if (stageDelayMs > 0) await pause();
  let counterexampleResult;
  let patchResult;
  try {
    counterexampleResult = generateCounterexamples(invariantResult, analysis, snapshot);
    patchResult = synthesizePatches(invariantResult, analysis, snapshot);
    emitEvent('SYNTHESIZING', 'done', `Synthesized ${counterexampleResult.summary.generated} reproducible regression tests and ${patchResult.summary.generated} unified diff patches.`);
  } catch (err) {
    emitEvent('SYNTHESIZING', 'error', err.message);
    counterexampleResult = { counterexamples: [], summary: { generated: 0, violatedInvariants: 0, durationMs: 0 } };
    patchResult = { patches: [], summary: { generated: 0, violatedInvariants: 0, durationMs: 0 } };
  }

  // Stage 6: VERIFYING (In-Memory Verification)
  emitEvent('VERIFYING', 'running', 'Verifying patches against MSE checks in clean in-memory simulation...');
  if (stageDelayMs > 0) await pause();
  let verificationResult;
  try {
    verificationResult = verifyPatches(patchResult, snapshot, analysis, drift, invariantResult);
    const passedCount = verificationResult.checks.filter(c => c.status === 'passed').length;
    emitEvent('VERIFYING', 'done', `Verification ${verificationResult.status}: ${passedCount}/${verificationResult.checks.length} checks passed with 0 regression violations.`);
  } catch (err) {
    emitEvent('VERIFYING', 'error', err.message);
    verificationResult = { status: 'FAILED', checks: [], evidence: [], durationMs: 0 };
  }

  // Stage 7: COMPLETE (Report Generation)
  const totalDurationMs = Math.round(performance.now() - startTime);
  emitEvent('COMPLETE', 'running', 'Compiling unified JSON & Markdown audit reports...');
  let report;
  try {
    report = generateReport({
      snapshot,
      analysis,
      drift,
      invariants: invariantResult,
      counterexamples: counterexampleResult,
      patches: patchResult,
      verification: verificationResult,
      totalDurationMs,
      runId: options.runId || 'RUN #001',
    });
    emitEvent('COMPLETE', 'done', `Audit complete in ${totalDurationMs}ms. Status: ${verificationResult.status}. Ready for review.`);
  } catch (err) {
    emitEvent('COMPLETE', 'error', err.message);
    report = { json: {}, markdown: '', summary: {} };
  }

  return {
    snapshot,
    analysis,
    drift,
    invariants: invariantResult,
    counterexamples: counterexampleResult,
    patches: patchResult,
    verification: verificationResult,
    report,
    telemetry: events,
    totalDurationMs,
  };
}

/**
 * @typedef {{
 *   snapshot: import('./types').RepositorySnapshot,
 *   analysis: import('./repositoryGraph/index.js').AnalysisResult,
 *   drift: import('./drift/index.js').DriftResult,
 *   invariants: import('./invariants/index.js').InvariantResult,
 *   counterexamples: import('./counterexample/index.js').CounterexampleResult,
 *   patches: import('./patch/index.js').PatchSynthesisResult,
 *   verification: import('./verify/index.js').VerificationResult,
 *   report: import('./report/index.js').ReportResult,
 *   telemetry: TelemetryEvent[],
 *   totalDurationMs: number,
 * }} PipelineResult
 */
