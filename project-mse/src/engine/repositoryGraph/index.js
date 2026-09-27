/**
 * Alpha — Repository Graph Analysis
 *
 * Deterministic structural analysis of JavaScript/TypeScript repositories.
 * Every value produced comes from actual regex-based scanning of file contents.
 *
 * Extracts:
 * - Source file classification
 * - Import/require statements
 * - Exported symbols
 * - Express-style routes (with middleware chain)
 * - Environment variable usage
 * - Likely entry points
 * - Dependency graph edges
 * - Structural findings
 */

import { extname, basename, resolveRelative } from '../pathUtils.js';

// ----- Pattern Libraries -----

const IMPORT_PATTERNS = [
  // ESM: import ... from '...'
  /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*from\s*['"]([^'"]+)['"]/g,
  // CJS: require('...')
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const EXPORT_PATTERNS = [
  // export function name
  /export\s+(?:async\s+)?function\s+(\w+)/g,
  // export const/let/var name
  /export\s+(?:const|let|var)\s+(\w+)/g,
  // export class name
  /export\s+class\s+(\w+)/g,
  // export default function/class name
  /export\s+default\s+(?:(?:async\s+)?function|class)\s+(\w+)/g,
  // export { name, name2 }
  /export\s*\{([^}]+)\}/g,
  // module.exports
  /module\.exports\s*=\s*(\{|\w+)/g,
];

const ROUTE_PATTERNS = [
  // router.METHOD('path' | "/path", ...)  or  app.METHOD(...) or webhookRouter.METHOD(...)
  /(?:[\w$]*router|app|Router\(\))\s*\.\s*(get|post|put|patch|delete|all|use)\s*\(\s*['"`]([^'"`]*?)['"`]/gi,
];

const ENV_VAR_PATTERNS = [
  // process.env.VARIABLE_NAME
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  // process.env['VARIABLE_NAME']
  /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
];

const AUTH_MIDDLEWARE_PATTERNS = [
  /requireAuth/i,
  /authenticate/i,
  /isAuthenticated/i,
  /passport\.authenticate/i,
  /verifyToken/i,
  /authMiddleware/i,
  /authGuard/i,
  /checkAuth/i,
];

const ASYNC_PATTERNS = [
  /\bawait\b/,
  /\.then\s*\(/,
  /new\s+Promise\s*\(/,
  /\basync\s+function\b/,
  /\basync\s*\(/,
];

const STATE_MUTATION_PATTERNS = [
  /\.query\s*\(/,
  /\.save\s*\(/,
  /\.create\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
  /\.insert\s*\(/,
  /\.remove\s*\(/,
  /\.push\s*\(/,
  /\.set\s*\(/,
  /\.write\s*\(/,
];

const TRANSACTION_PATTERNS = {
  begin: [/BEGIN\s*(?:TRANSACTION)?/i, /beginTransaction/i, /\.transaction\s*\(/i],
  commit: [/COMMIT/i, /\.commit\s*\(/],
  rollback: [/ROLLBACK/i, /\.rollback\s*\(/],
};

const ENTRY_POINT_NAMES = new Set([
  'server.js', 'server.ts', 'index.js', 'index.ts',
  'app.js', 'app.ts', 'main.js', 'main.ts',
]);

const SOURCE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
]);

// ----- Core Analysis Functions -----

/**
 * Analyze a complete repository snapshot.
 *
 * @param {import('../types').RepositorySnapshot} snapshot
 * @returns {AnalysisResult}
 */
export function analyzeRepository(snapshot) {
  const startTime = performance.now();

  const sourceFiles = snapshot.files.filter(f =>
    SOURCE_EXTENSIONS.has(extname(f.path))
  );
  const allFiles = snapshot.files;

  // Per-file analysis with fault-tolerant error boundary
  const fileAnalyses = [];
  const parseErrors = [];

  for (const f of sourceFiles) {
    try {
      if (!f || typeof f.content !== 'string') {
        throw new Error('File content is empty or not text');
      }
      fileAnalyses.push(analyzeFile(f));
    } catch (err) {
      parseErrors.push({
        file: f?.path || 'unknown',
        error: err.message || String(err),
      });
      // Fallback empty analysis so the file is not lost and partial results are returned
      fileAnalyses.push({
        path: f?.path || 'unknown',
        language: f?.language || 'unknown',
        lineCount: typeof f?.content === 'string' ? f.content.split('\n').length : 0,
        isEntryPoint: false,
        imports: [],
        exports: [],
        routes: [],
        envVars: [],
        asyncBoundaries: [],
        stateMutations: [],
        transactionSites: { begins: [], commits: [], rollbacks: [] },
        hasAuthMiddleware: false,
        parseError: err.message,
      });
    }
  }

  // Cross-file analysis
  const entrypoints = findEntrypoints(fileAnalyses, allFiles);
  const allRoutes = collectRoutes(fileAnalyses);
  const allEnvVars = collectEnvVars(fileAnalyses);
  const dependencies = buildDependencyGraph(fileAnalyses, snapshot);
  const graphEdges = buildGraphEdges(fileAnalyses, dependencies);
  const findings = extractFindings(fileAnalyses, dependencies, allRoutes, parseErrors);

  const durationMs = Math.round(performance.now() - startTime);

  return {
    repositoryStats: {
      totalFiles: allFiles.length,
      sourceFiles: sourceFiles.length,
      totalLines: sourceFiles.reduce((n, f) => n + (typeof f.content === 'string' ? f.content.split('\n').length : 0), 0),
      totalBytes: allFiles.reduce((n, f) => n + (typeof f.content === 'string' ? f.content.length : 0), 0),
      languages: [...new Set(sourceFiles.map(f => f.language).filter(Boolean))],
      durationMs,
    },
    files: fileAnalyses,
    entrypoints,
    routes: allRoutes,
    environmentVariables: allEnvVars,
    dependencies,
    graphEdges,
    findings,
    parseErrors,
  };
}

/**
 * Analyze a single source file.
 * @param {import('../types').RepositoryFile} file
 */
function analyzeFile(file) {
  const lines = file.content.split('\n');

  const imports = extractImports(file.content, file.path);
  const exports = extractExports(file.content);
  const routes = extractRoutes(file.content, file.path);
  const envVars = extractEnvVars(file.content, file.path);
  const asyncBoundaries = findMatchingLines(lines, ASYNC_PATTERNS);
  const stateMutations = findMatchingLines(lines, STATE_MUTATION_PATTERNS);
  const transactionSites = findTransactionSites(lines);

  const isEntryPoint = ENTRY_POINT_NAMES.has(basename(file.path));
  const hasAuthMiddleware = lines.some(line =>
    AUTH_MIDDLEWARE_PATTERNS.some(p => p.test(line))
  );

  return {
    path: file.path,
    language: file.language || 'javascript',
    lineCount: lines.length,
    isEntryPoint,
    imports,
    exports,
    routes,
    envVars,
    asyncBoundaries,
    stateMutations,
    transactionSites,
    hasAuthMiddleware,
  };
}

// ----- Extraction Helpers -----

function extractImports(content, filePath) {
  const imports = [];
  for (const pattern of IMPORT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const specifier = match[1];
      const lineNum = content.slice(0, match.index).split('\n').length;

      // Resolve relative imports
      let resolved = specifier;
      if (specifier.startsWith('.')) {
        resolved = resolveRelative(filePath, specifier);
      }

      imports.push({
        specifier,
        resolved,
        isRelative: specifier.startsWith('.'),
        line: lineNum,
      });
    }
  }
  return imports;
}

function extractExports(content) {
  const exports = [];
  const seen = new Set();

  for (const pattern of EXPORT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const rawName = match[1];
      if (!rawName) continue;

      // Handle export { a, b, c }
      if (rawName.includes(',') || rawName.includes('\n')) {
        const names = rawName.split(/[,\n]/).map(s => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean);
        for (const name of names) {
          if (!seen.has(name) && /^\w+$/.test(name)) {
            seen.add(name);
            const line = content.slice(0, match.index).split('\n').length;
            exports.push({ name, line });
          }
        }
      } else if (/^\w+$/.test(rawName) && !seen.has(rawName)) {
        seen.add(rawName);
        const line = content.slice(0, match.index).split('\n').length;
        exports.push({ name: rawName, line });
      }
    }
  }
  return exports;
}

function extractRoutes(content, filePath) {
  const routes = [];
  for (const pattern of ROUTE_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const path = match[2];
      const line = content.slice(0, match.index).split('\n').length;

      // Check if auth middleware appears in the same route registration line
      const routeLine = content.split('\n')[line - 1] || '';
      const hasAuth = AUTH_MIDDLEWARE_PATTERNS.some(p => p.test(routeLine));

      routes.push({
        method,
        path,
        file: filePath,
        line,
        hasAuth,
        excerpt: routeLine.trim().slice(0, 120),
      });
    }
  }
  return routes;
}

function extractEnvVars(content, filePath) {
  const vars = [];
  const seen = new Set();
  for (const pattern of ENV_VAR_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const name = match[1];
      if (seen.has(name)) continue;
      seen.add(name);
      const line = content.slice(0, match.index).split('\n').length;

      // Try to detect default value: process.env.X || 'default' or Number(process.env.X) || 8080
      const afterMatch = content.slice(match.index + match[0].length);
      const defaultMatch = afterMatch.match(/^\s*\)?\s*\|\|\s*['"`]?([^'"`;\n,)]+)['"`]?/);

      vars.push({
        name,
        file: filePath,
        line,
        defaultValue: defaultMatch ? defaultMatch[1].trim() : undefined,
      });
    }
  }
  return vars;
}

function findMatchingLines(lines, patterns) {
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (typeof rawLine !== 'string') continue;
    // Bound line length to 4096 chars to avoid ReDoS on minified or malicious bundles
    const line = rawLine.length > 4096 ? rawLine.slice(0, 4096) : rawLine;
    for (const p of patterns) {
      if (p.test(line)) {
        matches.push({ line: i + 1, excerpt: line.trim().slice(0, 120) });
        break;
      }
    }
  }
  return matches;
}

function findTransactionSites(lines) {
  const begins = [];
  const commits = [];
  const rollbacks = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TRANSACTION_PATTERNS.begin.some(p => p.test(line))) {
      begins.push({ line: i + 1, excerpt: line.trim().slice(0, 120) });
    }
    if (TRANSACTION_PATTERNS.commit.some(p => p.test(line))) {
      commits.push({ line: i + 1, excerpt: line.trim().slice(0, 120) });
    }
    if (TRANSACTION_PATTERNS.rollback.some(p => p.test(line))) {
      rollbacks.push({ line: i + 1, excerpt: line.trim().slice(0, 120) });
    }
  }
  return { begins, commits, rollbacks };
}

// ----- Cross-File Analysis -----

function findEntrypoints(fileAnalyses, allFiles) {
  const entrypoints = [];

  // Files with entry point names
  for (const fa of fileAnalyses) {
    if (fa.isEntryPoint) {
      entrypoints.push({
        file: fa.path,
        reason: `Filename "${basename(fa.path)}" matches entry point convention`,
      });
    }
  }

  // Check package.json for "main" field
  const pkgFile = allFiles.find(f => f.path === 'package.json' || f.path.endsWith('/package.json'));
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      if (pkg.main) {
        entrypoints.push({
          file: pkg.main,
          reason: `Referenced as "main" in package.json`,
        });
      }
      if (pkg.scripts?.start) {
        const startMatch = pkg.scripts.start.match(/node\s+(\S+\.(?:js|ts|mjs))/);
        if (startMatch) {
          entrypoints.push({
            file: startMatch[1],
            reason: `Referenced in package.json "start" script`,
          });
        }
      }
    } catch {
      // Invalid JSON
    }
  }

  return entrypoints;
}

function collectRoutes(fileAnalyses) {
  return fileAnalyses.flatMap(fa => fa.routes);
}

function collectEnvVars(fileAnalyses) {
  const allVars = fileAnalyses.flatMap(fa => fa.envVars);
  // Deduplicate by name, keeping all occurrences
  const byName = new Map();
  for (const v of allVars) {
    if (!byName.has(v.name)) {
      byName.set(v.name, { name: v.name, usages: [], defaultValue: v.defaultValue });
    }
    byName.get(v.name).usages.push({ file: v.file, line: v.line });
    if (v.defaultValue && !byName.get(v.name).defaultValue) {
      byName.get(v.name).defaultValue = v.defaultValue;
    }
  }
  return [...byName.values()];
}

function resolveKnownModule(resolved, knownPaths) {
  if (!resolved || resolved === '__proto__' || resolved === 'constructor') return null;
  if (knownPaths.has(resolved)) return resolved;

  const exts = ['.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs'];
  for (const ext of exts) {
    if (knownPaths.has(resolved + ext)) return resolved + ext;
  }

  const base = resolved.replace(/\.[a-z0-9]+$/i, '');
  for (const ext of exts) {
    if (knownPaths.has(base + ext)) return base + ext;
  }

  for (const ext of exts) {
    if (knownPaths.has(resolved + '/index' + ext)) return resolved + '/index' + ext;
  }

  return null;
}

function buildDependencyGraph(fileAnalyses, snapshot) {
  const knownPaths = new Set(snapshot.files.map(f => f.path));
  const graph = Object.create(null);

  for (const fa of fileAnalyses) {
    if (!fa || !fa.path || fa.path === '__proto__' || fa.path === 'constructor' || fa.path === 'prototype') continue;
    const deps = fa.imports
      .filter(imp => imp && imp.isRelative)
      .map(imp => resolveKnownModule(imp.resolved, knownPaths))
      .filter(Boolean);

    graph[fa.path] = [...new Set(deps)];
  }

  return graph;
}

function buildGraphEdges(fileAnalyses, dependencies) {
  const edges = [];

  // Import edges
  for (const [source, targets] of Object.entries(dependencies)) {
    for (const target of targets) {
      edges.push({ from: source, to: target, type: 'imports' });
    }
  }

  // Route registration edges (entry point → route file)
  for (const fa of fileAnalyses) {
    if (fa.isEntryPoint) {
      const deps = dependencies[fa.path] || [];
      for (const targetPath of deps) {
        const targetAnalysis = fileAnalyses.find(f => f.path === targetPath);
        if (targetAnalysis && targetAnalysis.routes.length > 0) {
          edges.push({ from: fa.path, to: targetPath, type: 'mounts-routes' });
        }
      }
    }
  }

  return edges;
}

// ----- Finding Extraction -----

function extractFindings(fileAnalyses, _dependencies, _allRoutes, parseErrors = []) {
  const findings = [];
  let findingCounter = 0;

  const nextId = (prefix) => {
    findingCounter++;
    return `${prefix}-${String(findingCounter).padStart(3, '0')}`;
  };

  // FINDING: File parse degradation
  for (const pe of parseErrors) {
    findings.push({
      id: nextId('ALPHA'),
      type: 'reliability',
      severity: 'MEDIUM',
      title: `Analysis degradation: Parser failure in ${basename(pe.file)}`,
      description: `File ${pe.file} could not be fully parsed: ${pe.error}. Partial repository analysis results were preserved.`,
      sourceEvidence: [{ file: pe.file, line: 1, excerpt: 'Parsing failed', context: pe.error }],
      documentationEvidence: [],
      confidence: 'high',
    });
  }

  // FINDING: Routes with state mutations but no auth middleware
  for (const fa of fileAnalyses) {
    for (const route of fa.routes) {
      if (route.method === 'USE') continue; // middleware registration, not a route
      const hasStateMutation = fa.stateMutations.length > 0 || fa.asyncBoundaries.length > 0;

      if (hasStateMutation && !route.hasAuth && (route.method === 'POST' || route.method === 'PUT' || route.method === 'DELETE' || route.method === 'PATCH')) {
        findings.push({
          id: nextId('ALPHA'),
          type: 'security',
          severity: 'CRITICAL',
          title: `Unguarded state-mutating route: ${route.method} ${route.path}`,
          description: `Route ${route.method} ${route.path} in ${route.file} performs state mutations via async operations but has no authentication middleware in its handler chain.`,
          sourceEvidence: [{
            file: route.file,
            line: route.line,
            excerpt: route.excerpt,
            context: 'Route registration without auth middleware',
          }],
          documentationEvidence: [],
          confidence: 'high',
        });
      }
    }
  }

  // FINDING: Transaction BEGIN without guaranteed COMMIT/ROLLBACK
  for (const fa of fileAnalyses) {
    const { begins, rollbacks } = fa.transactionSites;
    if (begins.length > 0 && rollbacks.length === 0) {
      findings.push({
        id: nextId('ALPHA'),
        type: 'data-integrity',
        severity: 'CRITICAL',
        title: `Unclosed transaction boundary in ${basename(fa.path)}`,
        description: `File ${fa.path} opens a database transaction (BEGIN) but has no ROLLBACK handler. On exception, the transaction remains open, risking data corruption and lock escalation.`,
        sourceEvidence: begins.map(b => ({
          file: fa.path,
          line: b.line,
          excerpt: b.excerpt,
          context: 'Transaction open without rollback guarantee',
        })),
        documentationEvidence: [],
        confidence: 'high',
      });
    }
  }

  // FINDING: Existing auth helper not used by routes that need it
  const authHelperFiles = fileAnalyses.filter(fa =>
    fa.exports.some(e => /verify.*signature|verifyWebhook/i.test(e.name))
  );
  for (const helperFile of authHelperFiles) {
    for (const helperExport of helperFile.exports) {
      if (!/verify.*signature|verifyWebhook/i.test(helperExport.name)) continue;

      // Find route files that could use this helper but don't import it
      const routeFiles = fileAnalyses.filter(fa =>
        fa.routes.length > 0 &&
        !fa.imports.some(imp => imp.resolved === helperFile.path)
      );

      for (const rf of routeFiles) {
        // Check if any routes in this file deal with webhooks
        const webhookRoutes = rf.routes.filter(r =>
          r.method !== 'USE' && /webhook|hook|github|stripe|twilio/i.test(r.path)
        );
        if (webhookRoutes.length > 0) {
          findings.push({
            id: nextId('ALPHA'),
            type: 'security',
            severity: 'HIGH',
            title: `Signature verification helper "${helperExport.name}" exists but is not used by ${basename(rf.path)}`,
            description: `${helperFile.path} exports "${helperExport.name}" but ${rf.path} does not import it. Webhook routes should verify HMAC signatures before processing payloads.`,
            sourceEvidence: [
              { file: helperFile.path, line: helperExport.line, excerpt: `export function ${helperExport.name}`, context: 'Auth helper is defined here' },
              ...webhookRoutes.map(r => ({ file: r.file, line: r.line, excerpt: r.excerpt, context: 'Webhook route does not use verification' })),
            ],
            documentationEvidence: [],
            confidence: 'high',
          });
        }
      }
    }
  }

  return findings;
}

/**
 * @typedef {{
 *   repositoryStats: {
 *     totalFiles: number,
 *     sourceFiles: number,
 *     totalLines: number,
 *     totalBytes: number,
 *     languages: string[],
 *     durationMs: number,
 *   },
 *   files: object[],
 *   entrypoints: object[],
 *   routes: object[],
 *   environmentVariables: object[],
 *   dependencies: Record<string, string[]>,
 *   graphEdges: object[],
 *   findings: import('../types').Finding[],
 * }} AnalysisResult
 */
