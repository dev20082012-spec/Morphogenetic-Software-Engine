/**
 * MSE Engine Orchestrator
 *
 * Top-level controller that sequences all three subagents (Alpha, Beta, Gamma)
 * and emits telemetry events onto the State Bus throughout the pipeline.
 * This module is the single authoritative entry point for a full MSE audit run.
 */

import path from 'node:path';
import { StateBus } from './state-bus.js';
import { InvariantManifold } from './invariant-manifold.js';
import { runMorphologist } from '../agents/morphologist.js';
import { runSymbiote }     from '../agents/symbiote.js';
import { runDriftEngine }  from '../reconciler/driftEngine.js';
import { runImmuneCore }   from '../agents/immuneCore.js';
import { withErrorBoundary, safeGet } from '../security/errors.js';

/**
 * @typedef {{ rootDir: string, outputDir?: string, applyPatches?: boolean, maxCegisIterations?: number }} OrchestratorOptions
 * @typedef {{ phase: string, status: 'running'|'done'|'error', payload?: unknown }} PhaseEvent
 */

export class Orchestrator {
  /** @param {OrchestratorOptions} options */
  constructor(options) {
    this.rootDir      = path.resolve(options.rootDir);
    this.outputDir    = path.resolve(options.outputDir || options.rootDir);
    this.applyPatches = options.applyPatches ?? false;
    this.bus          = new StateBus();
    this.manifold     = new InvariantManifold();
    this.maxCegisIterations = options.maxCegisIterations ?? 20;
  }

  /**
   * Subscribe to lifecycle telemetry events.
   * @param {(event: PhaseEvent) => void} handler
   * @returns {() => void} unsubscribe function
   */
  on(handler) {
    return this.bus.subscribe(handler);
  }

  /**
   * Run a full MSE audit pipeline.
   *
   * Execution order:
   *   1. Alpha (Morphologist) -- AST topology + invariant extraction
   *   2. Beta  (Symbiote)     -- document claim extraction + drift engine
   *   3. Gamma (Immune Core)  -- CEGIS counterexample synthesis (Phase 3)
   *
   * Each phase is wrapped in an error boundary so that a failure in one
   * subagent does not crash the orchestrator.
   *
   * @returns {Promise<import('./invariant-manifold.js').ManifoldState>}
   */
  async run() {
    this.bus.emitSync({ phase: 'ORCHESTRATOR', status: 'running', payload: { rootDir: this.rootDir } });

    // -------------------------------------------------------------------
    // Phase 1: Morphologist (Alpha) -- AST topology
    // -------------------------------------------------------------------
    this.bus.emitSync({ phase: 'ALPHA', status: 'running' });
    let morphReport;
    try {
      const outputFile = path.join(this.outputDir, 'discovered_invariants.json');
      morphReport = await withErrorBoundary('Morphologist', () =>
        runMorphologist(this.rootDir, outputFile)
      );
      if (morphReport.isErr()) throw morphReport.unwrapErr();
      morphReport = morphReport.unwrap();

      this.manifold.ingestTopology(morphReport);
      this.bus.emitSync({ phase: 'ALPHA', status: 'done', payload: morphReport.summary });
    } catch (err) {
      this.bus.emitSync({ phase: 'ALPHA', status: 'error', payload: { message: String(err.message) } });
      throw err;
    }

    // -------------------------------------------------------------------
    // Phase 2: Symbiote (Beta) -- document understanding + drift engine
    // -------------------------------------------------------------------
    this.bus.emitSync({ phase: 'BETA', status: 'running' });
    let driftReport;
    try {
      const symbioteOutputFile = path.join(this.outputDir, 'symbiote_report.json');
      const symbioteResult = await withErrorBoundary('Symbiote', () =>
        runSymbiote(this.rootDir, symbioteOutputFile)
      );
      if (symbioteResult.isErr()) throw symbioteResult.unwrapErr();
      const symbioteReport = symbioteResult.unwrap();

      const driftResult = await withErrorBoundary('DriftEngine', () =>
        runDriftEngine({
          symbioteReport,
          morphReport,
          rootDir:      this.rootDir,
          applyPatches: this.applyPatches,
        })
      );
      if (driftResult.isErr()) throw driftResult.unwrapErr();
      driftReport = driftResult.unwrap();

      // Write the drift report alongside the topology report
      const driftOutputFile = path.join(this.outputDir, 'drift_report.json');
      const fs = await import('node:fs');
      fs.writeFileSync(driftOutputFile, JSON.stringify(driftReport, null, 2), 'utf8');

      this.manifold.ingestDocDrift({
        docDriftCount:   driftReport.summary.totalDriftCount,
        reconciledFiles: symbioteReport.docFiles,
      });

      this.bus.emitSync({
        phase:   'BETA',
        status:  'done',
        payload: {
          dIntentScore:    driftReport.dIntentScore,
          totalDriftCount: driftReport.summary.totalDriftCount,
          criticalCount:   driftReport.summary.criticalCount,
          autoPatchedCount: driftReport.summary.autoPatchedCount,
        },
      });
    } catch (err) {
      this.bus.emitSync({ phase: 'BETA', status: 'error', payload: { message: String(err.message) } });
      // Beta failure is non-fatal; continue to Gamma with zeroed drift
      this.manifold.ingestDocDrift({ docDriftCount: 0, reconciledFiles: [] });
      driftReport = null;
    }

    // -------------------------------------------------------------------
    // Phase 3: Immune Core (Gamma) -- CEGIS synthesis
    // -------------------------------------------------------------------
    this.bus.emitSync({ phase: 'GAMMA', status: 'running' });
    try {
      const violations = [
        ...(safeGet(morphReport, 'discoveredInvariants', [])),
        ...(safeGet(driftReport, 'driftRecords', []))
          .filter(r => r.severity === 'CRITICAL' || r.severity === 'HIGH')
          .map(r => ({
            id:            r.id,
            type:          r.kind === 'AUTH_SCHEME_MISMATCH' ? 'SECURITY' : 'DRIFT',
            name:          r.detail || r.kind,
            severity:      r.severity,
            affectedFiles: [r.sourceCodeFile || r.sourceDocFile].filter(Boolean),
            evidence:      [],
          })),
      ];

      const immuneResult = await withErrorBoundary('ImmuneCore', () =>
        runImmuneCore({
          violations,
          outputDir:       this.outputDir,
          runVerification: false,
          maxIterations:   this.maxCegisIterations,
        })
      );
      if (immuneResult.isErr()) throw immuneResult.unwrapErr();
      const immuneReport = immuneResult.unwrap();

      this.manifold.ingestCegisResult({
        synthesizedTests: immuneReport.summary.synthesizedTests,
        patchesGenerated: immuneReport.summary.patchesGenerated,
      });

      this.bus.emitSync({ phase: 'GAMMA', status: 'done', payload: immuneReport.summary });
    } catch (err) {
      this.bus.emitSync({ phase: 'GAMMA', status: 'error', payload: { message: String(err.message) } });
      this.manifold.ingestCegisResult({ synthesizedTests: 0, patchesGenerated: 0 });
    }

    const finalState = this.manifold.snapshot();
    this.bus.emitSync({ phase: 'ORCHESTRATOR', status: 'done', payload: finalState.energyScore });
    return finalState;
  }
}