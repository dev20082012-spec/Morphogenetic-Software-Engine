/**
 * Alpha Blast Radius & Impact Analysis Engine
 *
 * Traverses the repository graph (import edges, route mounts, and call relationships)
 * to deterministically calculate the upstream callers, downstream dependencies,
 * and affected test suites for any finding or target file.
 *
 * Does NOT invent relationships. If no edges exist, marks isAvailable: false.
 */

import { normalizePath } from '../pathUtils.js';

/**
 * @typedef {{
 *   directlyAffectedFile: string,
 *   dependents: string[],
 *   dependencies: string[],
 *   affectedTests: string[],
 *   impactChain: string[],
 *   isAvailable: boolean,
 *   summary: string
 * }} BlastRadiusResult
 */

/**
 * Calculate the blast radius for a given target file.
 *
 * @param {string} targetFile
 * @param {import('../types').AnalysisResult} analysis
 * @param {import('../types').RepositorySnapshot} [snapshot]
 * @returns {BlastRadiusResult}
 */
export function calculateBlastRadius(targetFile, analysis, snapshot) {
  if (!targetFile || !analysis) {
    return {
      directlyAffectedFile: targetFile || '',
      dependents: [],
      dependencies: [],
      affectedTests: [],
      impactChain: [],
      isAvailable: false,
      summary: 'Impact graph unavailable for this finding.'
    };
  }

  const normalizedTarget = normalizePath(targetFile);
  const graphEdges = analysis.graphEdges || [];
  const dependencyMap = analysis.dependencies || {};
  const allFiles = snapshot?.files?.map(f => normalizePath(f.path)) || Object.keys(dependencyMap);

  // Helper: check if file is a test file
  const isTestFile = (path) => {
    const p = path.toLowerCase();
    return p.includes('test') || p.includes('spec') || p.endsWith('.test.ts') || p.endsWith('.test.js') || p.endsWith('.spec.ts') || p.endsWith('.spec.js');
  };

  // 1. Downstream dependencies: files that targetFile directly imports
  const directDeps = new Set();
  // Check dependencyMap
  for (const [source, targets] of Object.entries(dependencyMap)) {
    if (matchFilePath(source, normalizedTarget)) {
      for (const t of targets) {
        directDeps.add(normalizePath(t));
      }
    }
  }
  // Check graphEdges
  for (const edge of graphEdges) {
    if (matchFilePath(edge.from, normalizedTarget) && edge.to) {
      directDeps.add(normalizePath(edge.to));
    }
  }

  // 2. Upstream callers / dependents: files that import targetFile
  const upstreamCallers = new Set();
  for (const [source, targets] of Object.entries(dependencyMap)) {
    if (targets.some(t => matchFilePath(t, normalizedTarget))) {
      upstreamCallers.add(normalizePath(source));
    }
  }
  for (const edge of graphEdges) {
    if (matchFilePath(edge.to, normalizedTarget) && edge.from) {
      upstreamCallers.add(normalizePath(edge.from));
    }
  }

  // 3. Tests affected: any test file in upstream or downstream, or testing related symbols
  const affectedTests = new Set();
  for (const f of allFiles) {
    if (isTestFile(f)) {
      // If test imports target, or test imports any direct dependency of target
      const testImports = dependencyMap[f] || [];
      if (
        testImports.some(t => matchFilePath(t, normalizedTarget) || Array.from(directDeps).some(d => matchFilePath(t, d))) ||
        matchFilePath(f, normalizedTarget)
      ) {
        affectedTests.add(f);
      }
    }
  }

  const dependentsList = Array.from(upstreamCallers).filter(f => !isTestFile(f) && !matchFilePath(f, normalizedTarget));
  const dependenciesList = Array.from(directDeps).filter(f => !isTestFile(f) && !matchFilePath(f, normalizedTarget));
  const testList = Array.from(affectedTests);

  const hasConnections = dependentsList.length > 0 || dependenciesList.length > 0 || testList.length > 0;

  if (!hasConnections) {
    return {
      directlyAffectedFile: normalizedTarget,
      dependents: [],
      dependencies: [],
      affectedTests: [],
      impactChain: [],
      isAvailable: false,
      summary: 'Impact graph unavailable for this finding.'
    };
  }

  // Build a linear or staged impact chain: [upstreamCaller -> targetFile -> downstreamDep -> test]
  const impactChain = [];
  if (dependentsList.length > 0) {
    impactChain.push(dependentsList[0]);
  }
  impactChain.push(normalizedTarget);
  if (dependenciesList.length > 0) {
    impactChain.push(dependenciesList[0]);
  }
  if (testList.length > 0) {
    impactChain.push(testList[0]);
  }

  return {
    directlyAffectedFile: normalizedTarget,
    dependents: dependentsList,
    dependencies: dependenciesList,
    affectedTests: testList,
    impactChain: [...new Set(impactChain)],
    isAvailable: true,
    summary: `${dependentsList.length} caller(s), ${dependenciesList.length} dependency(ies), and ${testList.length} test suite(s) impacted.`
  };
}

/**
 * Fuzzy path matcher to handle relative extensions (.js vs .ts)
 */
function matchFilePath(pathA, pathB) {
  if (!pathA || !pathB) return false;
  const a = normalizePath(pathA).replace(/\.(js|ts|jsx|tsx)$/, '');
  const b = normalizePath(pathB).replace(/\.(js|ts|jsx|tsx)$/, '');
  return a === b || a.endsWith('/' + b) || b.endsWith('/' + a);
}
