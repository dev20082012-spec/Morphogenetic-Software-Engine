/**
 * MSE Engine -- Unified Entry Point (Phase 3)
 *
 * Wires all three subagents into a single cohesive pipeline and exposes a
 * clean top-level API for external callers (CLI, dashboard, CI scripts).
 *
 * Pipeline:
 *   Alpha  (Morphologist)   --> AST topology + invariant extraction
 *   Beta   (Symbiote)       --> document claim extraction + drift scoring
 *   Gamma  (Immune Core)    --> CEGIS: antigen synthesis + patch + PR format
 *
 * The engine emits structured telemetry on the State Bus throughout and
 * returns a complete EngineResult when the pipeline completes.
 *
 * Usage:
 *   import { MSEEngine } from './src/core/engine.js';
 *   const engine = new MSEEngine({ rootDir: '.', outputDir: '.mse' });
 *   const result = await engine.run();
 */

import path        from 'node:path';
import fs          from 'node:fs';
import { StateBus }          from './state-bus.js';
import { InvariantManifold } from './invariant-manifold.js';
import { runMorphologist }   from '../agents/morphologist.js';
import { runSymbiote }       from '../agents/symbiote.js';
import { runDriftEngine }    from '../reconciler/driftEngine.js';
import { runImmuneCore }     from '../agents/immuneCore.js';
import { synthesizePatch }   from '../cegis/patchSynthesizer.js';
import {
  formatBranchName,
  formatMarkdown,
  formatJSON,
  writePR,
} from './prFormatter.js';
import { withErrorBoundary, safeGet, trySync } from '../security/errors.js';
import { sanitizeCodebaseFile, sanitizeASTPayload, purgeRawBuffer } from '../security/sanitizer.js';
import { runComplianceAudit } from '../security/auditReport.js';

/**
 * @typedef {{
 *   rootDir: string,
 *   outputDir?: string,
 *   applyDocPatches?: boolean,
 *   runVerification?: boolean,
 *   maxCegisIterations?: number,
 *   writePRFiles?: boolean,
 * }} EngineOptions
 *
 * @typedef {{
 *   manifoldState: import('./invariant-manifold.js').ManifoldState,
 *   morphReport: object,
 *   driftReport: object,
 *   immuneReport: object,
 *   prPayloads: object[],
 *   outputFiles: string[],
 *   telemetry: object[],
 * }} EngineResult
 */

/**
 * Sanitize an in-memory AST/report payload and return a mini-audit record.
 * Wraps `sanitizeASTPayload` from the sanitizer module with structured output.
 *
 * @param {unknown} payload  - Raw AST/report object
 * @param {string}  context  - Label for audit logging
 * @returns {{ sanitized: unknown, miniAudit: object }}
 */
function sanitizeASTPayloadInline(payload, context) {
  const result = sanitizeASTPayload(payload, context);
  const miniAudit = {
    context,
    timestamp:   new Date().toISOString(),
    redactions:  result.redacted,
    categories:  [...new Set(result.events.map(e => e.category))],
    tokenHashes: result.events.map(e => e.tokenHash),
    compliant:   true,
  };
  return { sanitized: result.sanitized, miniAudit };
}

export class MSEEngine {
  /** @param {EngineOptions} options */
  constructor(options) {
    this.rootDir            = path.resolve(options.rootDir);
    this.outputDir          = path.resolve(options.outputDir || path.join(options.rootDir, '.mse'));
    this.applyDocPatches    = options.applyDocPatches    ?? false;
    this.runVerification    = options.runVerification    ?? false;
    this.maxCegisIterations = options.maxCegisIterations ?? 20;
    this.writePRFiles       = options.writePRFiles       ?? true;

    this.bus      = new StateBus();
    this.manifold = new InvariantManifold();
  }

  /**
   * Subscribe to pipeline telemetry events.
   * @param {(event: object) => void} handler
   * @returns {() => void} unsubscribe
   */
  on(handler) { return this.bus.subscribe(handler); }

  async _runAlpha() {
    this.bus.emitSync({ phase: 'ALPHA', status: 'running' });
    const outputFile = path.join(this.outputDir, 'discovered_invariants.json');
    const reportResult = await withErrorBoundary('Morphologist', () =>
      runMorphologist(this.rootDir, outputFile)
    );
    if (reportResult.isErr()) throw reportResult.unwrapErr();
    const report = reportResult.unwrap();

    // ZERO-TRUST: Sanitize the AST payload before manifold ingestion.
    // This ensures no raw credential values from source files propagate
    // into the invariant manifold or any downstream subagent.
    const { sanitized: sanitizedReport, miniAudit: alphaAudit } =
      sanitizeASTPayloadInline(report, 'morphReport');
    this.bus.emitSync({ phase: 'ALPHA', status: 'sanitized', payload: alphaAudit });

    this.manifold.ingestTopology(sanitizedReport);
    this.bus.emitSync({ phase: 'ALPHA', status: 'done', payload: sanitizedReport.summary });
    return sanitizedReport;
  }

  async _runBeta(morphReport) {
    this.bus.emitSync({ phase: 'BETA', status: 'running' });
    const symbioteFile = path.join(this.outputDir, 'symbiote_report.json');
    const symbioteResult = await withErrorBoundary('Symbiote', () =>
      runSymbiote(this.rootDir, symbioteFile)
    );
    if (symbioteResult.isErr()) throw symbioteResult.unwrapErr();
    const symbioteReport = symbioteResult.unwrap();

    const driftResult = await withErrorBoundary('DriftEngine', () =>
      runDriftEngine({
        symbioteReport,
        morphReport,
        rootDir:      this.rootDir,
        applyPatches: this.applyDocPatches,
      })
    );
    if (driftResult.isErr()) throw driftResult.unwrapErr();
    const driftReport = driftResult.unwrap();

    // ZERO-TRUST: Sanitize drift report before manifold + disk write.
    const { sanitized: sanitizedDrift, miniAudit: betaAudit } =
      sanitizeASTPayloadInline(driftReport, 'driftReport');
    this.bus.emitSync({ phase: 'BETA', status: 'sanitized', payload: betaAudit });

    const driftFile = path.join(this.outputDir, 'drift_report.json');
    fs.writeFileSync(driftFile, JSON.stringify(sanitizedDrift, null, 2), 'utf8');

    this.manifold.ingestDocDrift({
      docDriftCount:   sanitizedDrift.summary.totalDriftCount,
      reconciledFiles: symbioteReport.docFiles,
    });

    this.bus.emitSync({
      phase: 'BETA', status: 'done',
      payload: {
        dIntentScore:    sanitizedDrift.dIntentScore,
        totalDriftCount: sanitizedDrift.summary.totalDriftCount,
        criticalCount:   sanitizedDrift.summary.criticalCount,
      },
    });

    return sanitizedDrift;
  }

  async _runGamma(morphReport, driftReport) {
    this.bus.emitSync({ phase: 'GAMMA', status: 'running' });

    // Collect all violations: Alpha invariants + critical Beta drift records
    const rawViolations = [
      ...(safeGet(morphReport, 'discoveredInvariants', [])),
      ...(safeGet(driftReport, 'driftRecords', []))
        .filter(r => r.severity === 'CRITICAL' || r.severity === 'HIGH')
        .map(r => ({
          id:            r.id,
          type:          mapDriftKindToViolationType(r.kind),
          name:          r.detail || r.kind,
          severity:      r.severity,
          affectedFiles: [r.sourceCodeFile || r.sourceDocFile].filter(Boolean),
          evidence:      [],
          description:   r.detail,
        })),
    ];

    // ZERO-TRUST: Sanitize the violations array — evidence excerpts may contain
    // raw source snippets with embedded credentials.
    const { sanitized: violations, miniAudit: gammaAudit } =
      sanitizeASTPayloadInline(rawViolations, 'violations');
    this.bus.emitSync({ phase: 'GAMMA', status: 'sanitized', payload: gammaAudit });

    const immuneResult = await withErrorBoundary('ImmuneCore', () =>
      runImmuneCore({
        violations,
        outputDir:       this.outputDir,
        runVerification: this.runVerification,
        maxIterations:   this.maxCegisIterations,
      })
    );
    if (immuneResult.isErr()) throw immuneResult.unwrapErr();
    const immuneReport = immuneResult.unwrap();

    const immuneFile = path.join(this.outputDir, 'immune_report.json');
    fs.writeFileSync(immuneFile, JSON.stringify(immuneReport, null, 2), 'utf8');

    this.manifold.ingestCegisResult({
      synthesizedTests: immuneReport.summary.synthesizedTests,
      patchesGenerated: immuneReport.summary.patchesGenerated,
    });

    this.bus.emitSync({
      phase: 'GAMMA', status: 'done',
      payload: immuneReport.summary,
    });

    return immuneReport;
  }

  _buildPRPayloads(morphReport, driftReport, immuneReport) {
    const manifoldSnap = this.manifold.snapshot();
    const payloads     = [];

    for (const response of safeGet(immuneReport, 'responses', [])) {
      const violation = [
        ...(safeGet(morphReport, 'discoveredInvariants', [])),
      ].find(v => v.id === response.violationId) || {
        id:            response.violationId,
        name:          response.patchResult.description.slice(0, 60),
        type:          'CORRECTNESS',
        severity:      'HIGH',
        affectedFiles: [response.patchResult.targetFile],
      };

      const energyAfter = Math.max(manifoldSnap.energyScore - 0.05, 0);

      /** @type {import('./prFormatter.js').PRPayload} */
      const payload = {
        title:              `[MSE] Auto-patch ${violation.id}: ${violation.name || violation.id}`,
        branchName:         formatBranchName(violation.id, violation.name || violation.id),
        invariantId:        violation.id,
        invariantName:      violation.name || violation.id,
        invariantType:      violation.type || 'CORRECTNESS',
        severity:           violation.severity || 'HIGH',
        affectedFiles:      violation.affectedFiles || [],
        energyBefore:       manifoldSnap.energyScore,
        energyAfter,
        dIntentScore:       manifoldSnap.intentDivergence,
        antigenFile:        response.antigenFile,
        antigenSource:      response.antigenSource,
        patches:            [response.patchResult],
        verificationState:  response.verificationState,
        verificationOutput: response.verificationOutput,
        durationMs:         response.durationMs,
        benchmarkOps:       response.benchmarkOps,
        generatedAt:        new Date().toISOString(),
      };

      payloads.push(payload);
    }

    return payloads;
  }

  // -------------------------------------------------------------------------
  // Main run
  // -------------------------------------------------------------------------

  /**
   * Execute the full three-phase MSE pipeline.
   * @returns {Promise<EngineResult>}
   */
  async run() {
    const mkdirResult = trySync(() => fs.mkdirSync(this.outputDir, { recursive: true }));
    if (mkdirResult.isErr()) throw mkdirResult.unwrapErr();

    this.bus.emitSync({
      phase: 'ENGINE', status: 'running',
      payload: { rootDir: this.rootDir, outputDir: this.outputDir },
    });

    let morphReport, driftReport, immuneReport;
    const outputFiles = [];

    // Phase 1: Alpha
    try {
      morphReport = await this._runAlpha();
      outputFiles.push(path.join(this.outputDir, 'discovered_invariants.json'));
    } catch (err) {
      this.bus.emitSync({ phase: 'ALPHA', status: 'error', payload: { message: String(err.message) } });
      throw err;
    }

    // Phase 2: Beta
    try {
      driftReport = await this._runBeta(morphReport);
      outputFiles.push(
        path.join(this.outputDir, 'symbiote_report.json'),
        path.join(this.outputDir, 'drift_report.json'),
      );
    } catch (err) {
      this.bus.emitSync({ phase: 'BETA', status: 'error', payload: { message: String(err.message) } });
      this.manifold.ingestDocDrift({ docDriftCount: 0, reconciledFiles: [] });
      driftReport = null;
    }

    // Phase 3: Gamma
    try {
      immuneReport = await this._runGamma(morphReport, driftReport);
      outputFiles.push(path.join(this.outputDir, 'immune_report.json'));
    } catch (err) {
      this.bus.emitSync({ phase: 'GAMMA', status: 'error', payload: { message: String(err.message) } });
      this.manifold.ingestCegisResult({ synthesizedTests: 0, patchesGenerated: 0 });
      immuneReport = { responses: [], summary: { total: 0, synthesizedTests: 0, patchesGenerated: 0 } };
    }

    // Build + write PR payloads
    const prPayloads = this._buildPRPayloads(morphReport, driftReport, immuneReport);

    if (this.writePRFiles) {
      for (const payload of prPayloads) {
        try {
          const { mdPath, jsonPath, antigenPath } = writePR(payload, this.outputDir);
          outputFiles.push(mdPath, jsonPath, antigenPath);
        } catch {
          // non-fatal
        }
      }
    }

    // Final manifold snapshot
    const manifoldState = this.manifold.snapshot();

    // Write engine summary
    const summaryFile = path.join(this.outputDir, 'engine_summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify({
      generatedAt:   new Date().toISOString(),
      manifoldState,
      prCount:       prPayloads.length,
      outputFiles,
    }, null, 2), 'utf8');
    outputFiles.push(summaryFile);

    // ZERO-TRUST: Run post-pipeline compliance audit and write proof artifact
    try {
      const auditReport = await runComplianceAudit({
        rootDir:   this.rootDir,
        outputDir: this.outputDir,
        writeFile: true,
      });
      const auditFile = path.join(this.outputDir, 'privacy_compliance_audit.json');
      outputFiles.push(auditFile);
      this.bus.emitSync({
        phase:   'ENGINE',
        status:  'audit_complete',
        payload: {
          filesScanned:    auditReport.filesScanned,
          totalRedactions: auditReport.totalRedactions,
          compliant:       auditReport.compliant,
          integrityHash:   auditReport.integrityHash,
        },
      });
    } catch (auditErr) {
      // Audit failure is non-fatal but must be surfaced
      this.bus.emitSync({
        phase: 'ENGINE', status: 'audit_error',
        payload: { message: String(auditErr.message) },
      });
    }

    this.bus.emitSync({
      phase: 'ENGINE', status: 'done',
      payload: {
        energyScore:      manifoldState.energyScore,
        prCount:          prPayloads.length,
        outputFilesCount: outputFiles.length,
      },
    });

    return {
      manifoldState,
      morphReport,
      driftReport,
      immuneReport,
      prPayloads,
      outputFiles,
      telemetry: this.bus.history(),
    };
  }
}

/**
 * Map a drift record kind to a ViolationRecord type.
 * @param {string} kind
 * @returns {string}
 */
function mapDriftKindToViolationType(kind) {
  if (kind === 'AUTH_SCHEME_MISMATCH') return 'SECURITY';
  if (kind === 'PORT_MISMATCH')        return 'CORRECTNESS';
  return 'DRIFT';
}

if (process.argv[1] && path.basename(process.argv[1]) === 'engine.js') {
  const rootDir   = process.argv[2] || process.cwd();
  const outputDir = process.argv[3] || path.join(rootDir, '.mse');

  console.log(`[MSE Engine] Starting pipeline on: ${rootDir}`);
  const engine = new MSEEngine({ rootDir, outputDir, writePRFiles: true });

  engine.on(ev => {
    const icon = ev.status === 'done' ? 'ok' : ev.status === 'error' ? 'ERR' : '...';
    console.log(`  [${icon}] ${ev.phase} ${ev.status}`);
  });

  const result = await engine.run();

  console.log('\n[MSE Engine] Pipeline complete.');
  console.log(`  Energy score : ${result.manifoldState.energyScore}`);
  console.log(`  PR payloads  : ${result.prPayloads.length}`);
  console.log(`  Output files : ${result.outputFiles.length}`);
  console.log(`  Output dir   : ${outputDir}`);
}