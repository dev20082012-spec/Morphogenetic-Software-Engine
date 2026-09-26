/**
 * Invariant Manifold
 *
 * Models the Riemannian state-space manifold described in the MSE blueprint:
 *
 *   E(S) = D_intent(I, S) + λ · R_invariant(S) + γ · L_operational(S, E)
 *
 * The manifold accumulates outputs from all three subagents and computes a
 * composite energy score representing codebase entropy.  Lower energy = healthier
 * codebase.  A score of 0.0 represents a fully homeostatic system.
 */

/** @typedef {import('../agents/morphologist.js').runMorphologist} MorphReport */

/** Weight constants matching the blueprint formula. */
const LAMBDA = 0.35;  // penalty multiplier for invariant violations
const GAMMA  = 0.25;  // penalty multiplier for operational failures

/**
 * @typedef {{
 *   energyScore: number,
 *   intentDivergence: number,
 *   invariantPenalty: number,
 *   operationalLoss: number,
 *   invariantViolations: number,
 *   criticalViolations: number,
 *   docDriftCount: number,
 *   synthesizedTests: number,
 *   patchesGenerated: number,
 *   componentCount: number,
 *   routeCount: number,
 *   snapshotTime: string,
 * }} ManifoldState
 */

export class InvariantManifold {
  constructor() {
    /** @type {Partial<ManifoldState>} */
    this._state = {
      intentDivergence: 0,
      invariantPenalty: 0,
      operationalLoss: 0,
      invariantViolations: 0,
      criticalViolations: 0,
      docDriftCount: 0,
      synthesizedTests: 0,
      patchesGenerated: 0,
      componentCount: 0,
      routeCount: 0,
    };
  }

  /**
   * Ingest Morphologist (Alpha) output into the manifold.
   * @param {ReturnType<import('../agents/morphologist.js').runMorphologist>} report
   */
  ingestTopology(report) {
    const s = report.summary;
    this._state.invariantViolations = s.invariantViolations;
    this._state.criticalViolations = s.criticalViolations;
    this._state.componentCount = s.totalFilesScanned;
    this._state.routeCount = s.routeCount;

    // R_invariant(S): normalize by file count to keep scale comparable
    const fileCount = Math.max(s.totalFilesScanned, 1);
    this._state.invariantPenalty =
      (s.criticalViolations * 1.0 + (s.invariantViolations - s.criticalViolations) * 0.4) /
      fileCount;
  }

  /**
   * Ingest Symbiote (Beta) doc-drift output.
   * @param {{ docDriftCount: number, reconciledFiles: string[] }} result
   */
  ingestDocDrift(result) {
    this._state.docDriftCount = result.docDriftCount;
    const knownComponents = Math.max(this._state.componentCount || 1, 1);
    // D_intent(I, S): documentation drift fraction
    this._state.intentDivergence = result.docDriftCount / knownComponents;
  }

  /**
   * Ingest Immune Core (Gamma) CEGIS output.
   * @param {{ synthesizedTests: number, patchesGenerated: number }} result
   */
  ingestCegisResult(result) {
    this._state.synthesizedTests = result.synthesizedTests;
    this._state.patchesGenerated = result.patchesGenerated;
    // L_operational(S, E): unresolved test failures still outstanding
    const unresolved = Math.max(result.synthesizedTests - result.patchesGenerated, 0);
    const knownComponents = Math.max(this._state.componentCount || 1, 1);
    this._state.operationalLoss = unresolved / knownComponents;
  }

  /**
   * Compute and return the current manifold snapshot.
   * @returns {ManifoldState}
   */
  snapshot() {
    const D = this._state.intentDivergence ?? 0;
    const R = this._state.invariantPenalty ?? 0;
    const L = this._state.operationalLoss ?? 0;

    const energyScore = parseFloat((D + LAMBDA * R + GAMMA * L).toFixed(6));

    return {
      ...this._state,
      energyScore,
      snapshotTime: new Date().toISOString(),
    };
  }
}
