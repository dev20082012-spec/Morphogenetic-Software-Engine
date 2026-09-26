/**
 * Subagent Alpha: The Morphologist
 *
 * Autonomous AST crawling engine for Project MSE.
 * Traverses repository topology, extracts entry points, route definitions,
 * asynchronous boundaries, state mutations, and serializes all latent
 * invariants into a structured JSON output.
 *
 * Output: discovered_invariants.json
 */

import fs   from 'node:fs';
import path from 'node:path';
import {
  assertWithinRoot,
  collectFilesSafe,
  atomicWriteSync,
  isSafeFilename,
} from '../security/pathguard.js';
import { safeTest } from '../security/redos.js';
import { trySync, safeGet } from '../security/errors.js';

// Security constants

/** Maximum bytes read from a single source file (10 MB). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Maximum directory traversal depth. */
const MAX_WALK_DEPTH = 32;

/** Maximum number of source files processed in one run. */
const MAX_FILES = 10_000;

// Language-specific AST node classifiers (pre-compiled, validated safe)

const ASYNC_BOUNDARY_PATTERNS = [
  /\bawait\b/,
  /\.then\s*\(/,
  /new\s+Promise\s*\(/,
  /\basync\s+function\b/,
  /\basync\s*\(/,
  /setTimeout|setInterval|setImmediate/,
  /EventEmitter|\.on\(|\.emit\(/,
  /readFile|writeFile|createReadStream|createWriteStream/,
];

const MUTEX_PATTERNS = [
  /\.lock\s*\(/,
  /\.unlock\s*\(/,
  /\.acquire\s*\(/,
  /\.release\s*\(/,
  /Mutex|Semaphore|RWLock/,
  /BEGIN\s+TRANSACTION|COMMIT|ROLLBACK/i,
  /db\.transaction|session\.beginTransaction/,
];

const STATE_MUTATION_PATTERNS = [
  /setState\s*\(/,
  /dispatch\s*\(/,
  /\.set\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
  /\.push\s*\(|\.pop\s*\(|\.shift\s*\(|\.splice\s*\(/,
  /=\s*(?!==)/,
];

const TOKEN_VALIDATION_PATTERNS = [
  /jwt\.verify|jwt\.sign|jwt\.decode/,
  /verifyToken|validateToken|checkAuth/,
  /Authorization:\s*Bearer/,
  /req\.user|req\.auth|req\.principal/,
  /passport\.authenticate|isAuthenticated/,
];

const ENTRY_POINT_PATTERNS = [
  /^(index|main|server|app)\.(js|ts|mjs|cjs)$/,
  /^bin\//,
];

const ROUTE_PATTERNS = [
  /\.(get|post|put|patch|delete|all)\s*\(\s*['"`]/,
  /router\.(get|post|put|patch|delete)\s*\(/,
  /app\.(get|post|put|patch|delete)\s*\(/,
  /Route\s*path=/,
  /@(Get|Post|Put|Patch|Delete|Controller)\s*\(/,
  /path:\s*['"`]\//,
];

// File system traversal

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build',
  'coverage', '.cache', '__pycache__', '.tox', 'vendor',
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.go', '.java', '.rs', '.cs',
]);

/**
 * Recursively collect all source files under rootDir.
 * Uses centralized path guard for traversal safety.
 * @param {string} rootDir
 * @returns {string[]} absolute file paths
 */
function collectSourceFiles(rootDir) {
  const resolvedRoot = path.resolve(rootDir);

  const results = collectFilesSafe(resolvedRoot, {
    maxDepth: MAX_WALK_DEPTH,
    maxFiles: MAX_FILES,
    ignoredDirs: IGNORED_DIRS,
    allowedExtensions: SUPPORTED_EXTENSIONS,
  });

  return results;
}

// Pattern matching helpers

/**
 * Scan a set of lines with a pattern array; return matching line numbers and excerpts.
 * Uses safe regex execution to prevent ReDoS.
 * @param {string[]} lines
 * @param {RegExp[]} patterns
 * @returns {{ lineNumber: number, excerpt: string }[]}
 */
function matchLines(lines, patterns) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      // Use safeTest to prevent ReDoS on pathological inputs
      if (safeTest(pattern, line)) {
        hits.push({
          lineNumber: i + 1,
          excerpt: line.trim().slice(0, 120),
        });
        break; // one hit per line is sufficient
      }
    }
  }
  return hits;
}

/**
 * Extract named exports and function declarations from a source file.
 * @param {string[]} lines
 * @returns {string[]}
 */
function extractExports(lines) {
  const exports = [];
  const exportRe = /export\s+(default\s+)?(function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;
  const moduleExportsRe = /module\.exports\s*(?:=|\[(['"`]([A-Za-z_$][A-Za-z0-9_$]*)))/;

  for (const line of lines) {
    const m = exportRe.exec(line) || moduleExportsRe.exec(line);
    if (m) {
      const name = m[3] || m[2];
      if (name) exports.push(name);
    }
  }
  return exports;
}

/**
 * Extract import/require dependency edges from a file.
 * @param {string[]} lines
 * @param {string} filePath
 * @param {string} rootDir
 * @returns {string[]} resolved module paths (relative specifiers only)
 */
function extractDependencies(lines, filePath, rootDir) {
  const deps = [];
  const importRe = /(?:import\s+.*from\s+|require\s*\(\s*)['"`](\.\.?\/[^'"`]+)['"`]/;

  for (const line of lines) {
    const m = importRe.exec(line);
    if (m) {
      const resolved = path.resolve(path.dirname(filePath), m[1]);
      const relative = path.relative(rootDir, resolved);
      // Validate the dependency stays within root
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
        deps.push(relative);
      }
    }
  }
  return [...new Set(deps)];
}

// Per-file analysis

/**
 * Analyse a single source file and return its topology record.
 * @param {string} filePath
 * @param {string} rootDir
 * @returns {import('./types.js').FileTopology|null}
 */
function analyseFile(filePath, rootDir) {
  // SEC: reject traversal paths before touching the filesystem
  const validateResult = trySync(() => assertWithinRoot(rootDir, filePath));
  if (validateResult.isErr()) return null;

  // SEC: check file size before reading to avoid OOM on huge generated files
  const statResult = trySync(() => fs.statSync(filePath));
  if (statResult.isErr()) return null;
  const stat = statResult.unwrap();
  if (stat.size > MAX_FILE_BYTES) return null;

  const sourceResult = trySync(() => fs.readFileSync(filePath, 'utf8'));
  if (sourceResult.isErr()) return null;
  let source = sourceResult.unwrap();

  // SEC: guard against binary/null-byte content masquerading as source
  if (source.includes('\0')) return null;

  const lines = source.split('\n');
  const relativePath = path.relative(rootDir, filePath);
  const fileName = path.basename(filePath);

  // Validate filename safety
  if (!isSafeFilename(fileName)) return null;

  const isEntryPoint = ENTRY_POINT_PATTERNS.some(p =>
    typeof p === 'string' ? relativePath === p : p.test(fileName) || p.test(relativePath)
  );

  const routes = matchLines(lines, ROUTE_PATTERNS);
  const asyncBoundaries = matchLines(lines, ASYNC_BOUNDARY_PATTERNS);
  const stateMutations = matchLines(lines, STATE_MUTATION_PATTERNS);
  const mutexSites = matchLines(lines, MUTEX_PATTERNS);
  const tokenValidationSites = matchLines(lines, TOKEN_VALIDATION_PATTERNS);
  const exports = extractExports(lines);
  const dependencies = extractDependencies(lines, filePath, rootDir);

  return {
    path: relativePath,
    isEntryPoint,
    lineCount: lines.length,
    exports,
    dependencies,
    routes: routes.map(r => ({ ...r, method: extractRouteMethod(r.excerpt) })),
    asyncBoundaries,
    stateMutations,
    latentInvariants: {
      mutexLifecycles: mutexSites,
      transactionBoundaries: mutexSites.filter(s =>
        /BEGIN|COMMIT|ROLLBACK|transaction/i.test(s.excerpt)
      ),
      tokenValidationSequences: tokenValidationSites,
    },
  };
}

/**
 * Extract HTTP method from a route excerpt string.
 * @param {string} excerpt
 * @returns {string}
 */
function extractRouteMethod(excerpt) {
  const m = /\.(get|post|put|patch|delete|all)\s*\(|@(Get|Post|Put|Patch|Delete)/i.exec(excerpt);
  return m ? (m[1] || m[2]).toUpperCase() : 'UNKNOWN';
}

// Invariant extraction

/**
 * Derive systemic invariants from the full topology.
 * Detects cross-file patterns that constitute implicit architectural rules.
 *
 * @param {import('./types.js').FileTopology[]} topologies
 * @returns {import('./types.js').LatentInvariant[]}
 */
function extractSystemInvariants(topologies) {
  const invariants = [];

  // Invariant I-1: Every async boundary in a state-mutating function
  // must be preceded by a token validation checkpoint.
  const authFiles = topologies.filter(t =>
    t.latentInvariants.tokenValidationSequences.length > 0
  );
  const asyncStateFiles = topologies.filter(t =>
    t.asyncBoundaries.length > 0 && t.stateMutations.length > 0
  );
  const unguardedStateFiles = asyncStateFiles.filter(t =>
    !authFiles.some(a => a.path === t.path) &&
    !t.dependencies.some(dep => authFiles.some(a => a.path.startsWith(dep)))
  );

  if (unguardedStateFiles.length > 0) {
    invariants.push({
      id: 'INV-001',
      type: 'SECURITY',
      name: 'Unguarded Async State Mutation',
      description:
        'Files containing both async boundaries and state mutations with no token ' +
        'validation in scope violate the authentication-before-write invariant.',
      severity: 'CRITICAL',
      affectedFiles: unguardedStateFiles.map(t => t.path),
      evidence: unguardedStateFiles.flatMap(t =>
        t.stateMutations.slice(0, 3).map(m => ({
          file: t.path,
          lineNumber: m.lineNumber,
          excerpt: m.excerpt,
        }))
      ),
    });
  }

  // Invariant I-2: Mutex acquire/release pairs must be balanced within the same file scope.
  for (const topology of topologies) {
    const acquires = topology.latentInvariants.mutexLifecycles.filter(s =>
      /lock|acquire/i.test(s.excerpt)
    );
    const releases = topology.latentInvariants.mutexLifecycles.filter(s =>
      /unlock|release/i.test(s.excerpt)
    );
    if (acquires.length > 0 && acquires.length !== releases.length) {
      invariants.push({
        id: `INV-002-${topology.path.replace(/\//g, '_')}`,
        type: 'CONCURRENCY',
        name: 'Unbalanced Mutex Lifecycle',
        description:
          `File '${topology.path}' has ${acquires.length} acquire(s) and ` +
          `${releases.length} release(s). Unbalanced mutex lifecycles risk deadlock.`,
        severity: 'HIGH',
        affectedFiles: [topology.path],
        evidence: [...acquires, ...releases],
      });
    }
  }

  // Invariant I-3: Database transaction open must always have a paired COMMIT or ROLLBACK.
  for (const topology of topologies) {
    const opens = topology.latentInvariants.transactionBoundaries.filter(s =>
      /BEGIN|beginTransaction/i.test(s.excerpt)
    );
    const closes = topology.latentInvariants.transactionBoundaries.filter(s =>
      /COMMIT|ROLLBACK|commitTransaction|rollbackTransaction/i.test(s.excerpt)
    );
    if (opens.length > 0 && closes.length === 0) {
      invariants.push({
        id: `INV-003-${topology.path.replace(/\//g, '_')}`,
        type: 'DATA_INTEGRITY',
        name: 'Unclosed Transaction Boundary',
        description:
          `File '${topology.path}' opens a database transaction but contains no ` +
          'COMMIT or ROLLBACK. Uncommitted transactions can cause data corruption and lock escalation.',
        severity: 'CRITICAL',
        affectedFiles: [topology.path],
        evidence: opens,
      });
    }
  }

  // Invariant I-4: Route handlers without async boundaries should not perform I/O.
  // (detected as route files that import I/O modules but have no await/then)
  const ioImportRe = /fs|database|db|repository|storage|redis|mongo|postgres|mysql/i;
  for (const topology of topologies) {
    const hasRoutes = topology.routes.length > 0;
    const hasIoDeps = topology.dependencies.some(d => ioImportRe.test(d));
    const lacksAsync = topology.asyncBoundaries.length === 0;
    if (hasRoutes && hasIoDeps && lacksAsync) {
      invariants.push({
        id: `INV-004-${topology.path.replace(/\//g, '_')}`,
        type: 'CORRECTNESS',
        name: 'Synchronous I/O in Route Handler',
        description:
          `Route file '${topology.path}' imports I/O-heavy modules but has no ` +
          'async boundaries. Synchronous I/O blocks the event loop under load.',
        severity: 'HIGH',
        affectedFiles: [topology.path],
        evidence: topology.routes.slice(0, 5),
      });
    }
  }

  return invariants;
}

// Graph construction

/**
 * Build a directed dependency graph (adjacency list) from file topologies.
 * @param {import('./types.js').FileTopology[]} topologies
 * @returns {Record<string, string[]>}
 */
function buildDependencyGraph(topologies) {
  const graph = {};
  for (const t of topologies) {
    graph[t.path] = t.dependencies.filter(dep =>
      topologies.some(o => o.path.startsWith(dep) || o.path === dep + '.js' || o.path === dep + '.ts')
    );
  }
  return graph;
}

// Main orchestration

/**
 * Run the Morphologist over a repository root.
 *
 * @param {string} rootDir - absolute path to the repository root
 * @param {string} [outputPath] - where to write discovered_invariants.json
 * @returns {import('./types.js').MorphologistReport}
 */
export function runMorphologist(rootDir, outputPath) {
  const resolvedRoot = path.resolve(rootDir);
  const sourceFiles = collectSourceFiles(resolvedRoot);

  const topologies = sourceFiles
    .map(f => analyseFile(f, resolvedRoot))
    .filter(Boolean);

  const entryPoints = topologies.filter(t => t.isEntryPoint).map(t => t.path);
  const allRoutes = topologies.flatMap(t =>
    t.routes.map(r => ({ file: t.path, ...r }))
  );
  const systemInvariants = extractSystemInvariants(topologies);
  const dependencyGraph = buildDependencyGraph(topologies);

  const report = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    repositoryRoot: resolvedRoot,
    summary: {
      totalFilesScanned: sourceFiles.length,
      entryPointCount: entryPoints.length,
      routeCount: allRoutes.length,
      asyncBoundaryCount: topologies.reduce((n, t) => n + t.asyncBoundaries.length, 0),
      stateMutationCount: topologies.reduce((n, t) => n + t.stateMutations.length, 0),
      invariantViolations: systemInvariants.length,
      criticalViolations: systemInvariants.filter(i => i.severity === 'CRITICAL').length,
    },
    entryPoints,
    routeManifest: allRoutes,
    componentTopology: topologies,
    dependencyGraph,
    discoveredInvariants: systemInvariants,
  };

  const dest = outputPath || path.join(resolvedRoot, 'discovered_invariants.json');
  const destResolved = path.resolve(dest);

  // SEC: ensure output path stays within resolvedRoot (or an explicit outputPath)
  if (!outputPath) {
    // only enforce containment when the path is auto-derived
    assertWithinRoot(resolvedRoot, destResolved);
  }

  // Atomic write to prevent partial writes (allow output to be outside root)
  atomicWriteSync(resolvedRoot, destResolved, JSON.stringify(report, null, 2), 'utf8', true);

  return report;
}

// CLI entry point

if (process.argv[1] && path.basename(process.argv[1]) === 'morphologist.js') {
  const targetDir = process.argv[2] || process.cwd();
  const outputFile = process.argv[3];

  console.log(`[Morphologist] Scanning: ${targetDir}`);
  const report = runMorphologist(targetDir, outputFile);

  console.log('[Morphologist] Scan complete.');
  console.log(`  Files scanned   : ${report.summary.totalFilesScanned}`);
  console.log(`  Entry points    : ${report.summary.entryPointCount}`);
  console.log(`  Routes found    : ${report.summary.routeCount}`);
  console.log(`  Async boundaries: ${report.summary.asyncBoundaryCount}`);
  console.log(`  State mutations : ${report.summary.stateMutationCount}`);
  console.log(`  Invariant hits  : ${report.summary.invariantViolations} (${report.summary.criticalViolations} critical)`);
  console.log(`  Output written  : ${outputFile || path.join(path.resolve(targetDir), 'discovered_invariants.json')}`);
}