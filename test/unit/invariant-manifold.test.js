/**
 * Unit Tests: InvariantManifold
 */
import { describe, it, expect } from 'vitest';
import { InvariantManifold } from '../../src/core/invariant-manifold.js';

const MOCK_TOPOLOGY = {
  summary: {
    totalFilesScanned: 20,
    entryPointCount: 2,
    routeCount: 8,
    asyncBoundaryCount: 15,
    stateMutationCount: 30,
    invariantViolations: 4,
    criticalViolations: 2,
  },
  componentTopology: [],
  routeManifest: [],
  discoveredInvariants: [],
};

describe('InvariantManifold', () => {
  it('starts with zero energy score', () => {
    const m = new InvariantManifold();
    expect(m.snapshot().energyScore).toBe(0);
  });

  it('ingests topology and calculates invariant penalty', () => {
    const m = new InvariantManifold();
    m.ingestTopology(MOCK_TOPOLOGY);
    const snap = m.snapshot();
    expect(snap.invariantViolations).toBe(4);
    expect(snap.criticalViolations).toBe(2);
    expect(snap.invariantPenalty).toBeGreaterThan(0);
  });

  it('ingests doc drift and raises intent divergence', () => {
    const m = new InvariantManifold();
    m.ingestTopology(MOCK_TOPOLOGY);
    m.ingestDocDrift({ docDriftCount: 5, reconciledFiles: ['README.md'] });
    const snap = m.snapshot();
    expect(snap.docDriftCount).toBe(5);
    expect(snap.intentDivergence).toBeGreaterThan(0);
  });

  it('ingests CEGIS result and updates operational loss for unresolved tests', () => {
    const m = new InvariantManifold();
    m.ingestTopology(MOCK_TOPOLOGY);
    m.ingestCegisResult({ synthesizedTests: 3, patchesGenerated: 1 });
    const snap = m.snapshot();
    expect(snap.synthesizedTests).toBe(3);
    expect(snap.patchesGenerated).toBe(1);
    expect(snap.operationalLoss).toBeGreaterThan(0);
  });

  it('computes zero operational loss when all tests are patched', () => {
    const m = new InvariantManifold();
    m.ingestTopology(MOCK_TOPOLOGY);
    m.ingestCegisResult({ synthesizedTests: 3, patchesGenerated: 3 });
    const snap = m.snapshot();
    expect(snap.operationalLoss).toBe(0);
  });

  it('energy score is the sum of weighted components', () => {
    const LAMBDA = 0.35;
    const GAMMA  = 0.25;
    const m = new InvariantManifold();
    m.ingestTopology(MOCK_TOPOLOGY);
    m.ingestDocDrift({ docDriftCount: 4, reconciledFiles: [] });
    m.ingestCegisResult({ synthesizedTests: 2, patchesGenerated: 0 });
    const snap = m.snapshot();
    const expected = snap.intentDivergence + LAMBDA * snap.invariantPenalty + GAMMA * snap.operationalLoss;
    expect(snap.energyScore).toBeCloseTo(expected, 5);
  });
});
