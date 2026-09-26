/**
 * Subagent Beta: The Symbiote -- Bidirectional Intent Engine
 *
 * Reconciles natural-language documentation (README.md, OpenAPI specs,
 * inline JSDoc) against the live AST topology produced by Subagent Alpha.
 * Computes a doc-drift score and emits a structured divergence report.
 *
 * Doc-drift is defined as: the set of symbols, routes, and modules that
 * exist in code but are absent or contradicted in documentation, and vice-versa.
 */

import fs from 'node:fs';
import path from 'node:path';
import { assertWithinRoot, tryWithinRoot, collectFilesSafe, isSafeFilename } from '../security/pathguard.js';
import { trySync, safeGet } from '../security/errors.js';

// Documentation extraction

/**
 * Extract all section headings and code-fenced symbol names from a markdown file.
 * @param {string} source
 * @returns {{ headings: string[], codeRefs: string[], rawText: string }}
 */
function parseMarkdown(source) {
  const lines = source.split('\n');
  const headings = [];
  const codeRefs = [];

  for (const line of lines) {
    const headingM = /^#{1,6}\s+(.+)/.exec(line);
    if (headingM) {
      headings.push(headingM[1].trim().toLowerCase());
      continue;
    }
    // inline code references like `functionName` or `ClassName`
    const codeM = line.match(/`([A-Za-z_$][A-Za-z0-9_$.]*)`/g);
    if (codeM) {
      for (const ref of codeM) {
        codeRefs.push(ref.replace(/`/g, ''));
      }
    }
  }

  return { headings, codeRefs, rawText: source.slice(0, 1_000_000) };
}

/**
 * Collect all documentation files under rootDir.
 * Includes .md, .mdx, .txt, and openapi yaml/json.
 * Uses centralized path guard for traversal safety.
 * @param {string} rootDir
 * @returns {string[]}
 */
function collectDocFiles(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.yaml', '.yml', '.json']);
  const DOC_IGNORED = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
  const results = [];

  const files = collectFilesSafe(resolvedRoot, {
    maxDepth: 32,
    maxFiles: 5000,
    ignoredDirs: DOC_IGNORED,
    allowedExtensions: DOC_EXTENSIONS,
  });

  return files;
}

// OpenAPI path extraction

/**
 * Extract HTTP paths from an OpenAPI-style JSON or YAML doc (text-only, no full parser).
 * @param {string} source
 * @returns {string[]}
 */
function extractOpenAPIPaths(source) {
  const pathRe = /['"]?(\/[a-zA-Z0-9/_{}.-]+)['"]?\s*:/g;
  const paths = [];
  let m;
  while ((m = pathRe.exec(source)) !== null) {
    if (m[1].includes('/')) paths.push(m[1]);
  }
  return [...new Set(paths)];
}

// Drift detection

/**
 * @typedef {{
 *   file: string,
 *   kind: 'UNDOCUMENTED_SYMBOL' | 'ORPHAN_DOC_REF' | 'MISSING_ROUTE_DOC' | 'STALE_HEADING',
 *   symbol: string,
 *   detail: string,
 * }} DriftRecord
 */

/**
 * Compare parsed documentation against an AST topology report.
 *
 * @param {string} rootDir
 * @param {import('../agents/morphologist.js').runMorphologist} topologyReport
 * @returns {{ driftRecords: DriftRecord[], docDriftCount: number, reconciledFiles: string[] }}
 */
export function reconcile(rootDir, topologyReport) {
  const resolvedRoot = path.resolve(rootDir);
  const docFiles = collectDocFiles(resolvedRoot);
  const driftRecords = [];
  const reconciledFiles = [];

  // Build a flat set of all documented symbol names from all doc files
  const documentedSymbols = new Set();
  const documentedPaths = new Set();

  for (const docFile of docFiles) {
    const srcResult = trySync(() => fs.readFileSync(docFile, 'utf8'));
    if (srcResult.isErr()) continue;
    const src = srcResult.unwrap();

    reconciledFiles.push(path.relative(resolvedRoot, docFile));

    const ext = path.extname(docFile).toLowerCase();
    if (ext === '.md' || ext === '.mdx' || ext === '.txt') {
      const { codeRefs } = parseMarkdown(src);
      for (const ref of codeRefs) documentedSymbols.add(ref);
    }
    if (ext === '.yaml' || ext === '.yml' || ext === '.json') {
      const paths = extractOpenAPIPaths(src);
      for (const p of paths) documentedPaths.add(p);
    }
  }

  // Check: exported symbols in code that have no doc reference
  for (const topology of safeGet(topologyReport, 'componentTopology', [])) {
    for (const exp of safeGet(topology, 'exports', [])) {
      if (!documentedSymbols.has(exp)) {
        driftRecords.push({
          file: topology.path,
          kind: 'UNDOCUMENTED_SYMBOL',
          symbol: exp,
          detail: `Exported symbol '${exp}' in '${topology.path}' has no documentation reference.`,
        });
      }
    }
  }

  // Check: code-level routes that appear in no OpenAPI doc
  for (const route of safeGet(topologyReport, 'routeManifest', [])) {
    const routePath = route.excerpt?.match(/['"`](\/[^'"`]+)['"`]/)?.[1];
    if (routePath && !documentedPaths.has(routePath)) {
      driftRecords.push({
        file: route.file,
        kind: 'MISSING_ROUTE_DOC',
        symbol: routePath,
        detail: `Route '${route.method} ${routePath}' in '${route.file}' is absent from all OpenAPI specs.`,
      });
    }
  }

  // Check: doc code-refs that have no corresponding exported symbol in the codebase
  const allExportedSymbols = new Set(
    safeGet(topologyReport, 'componentTopology', []).flatMap(t => safeGet(t, 'exports', []))
  );
  for (const ref of documentedSymbols) {
    if (!allExportedSymbols.has(ref)) {
      driftRecords.push({
        file: 'docs',
        kind: 'ORPHAN_DOC_REF',
        symbol: ref,
        detail: `Documentation references '${ref}' but no corresponding export exists in the codebase.`,
      });
    }
  }

  return {
    driftRecords,
    docDriftCount: driftRecords.length,
    reconciledFiles,
  };
}