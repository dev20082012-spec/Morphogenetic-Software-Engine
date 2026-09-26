/**
 * Drift Engine -- Bidirectional Intent Reconciliation (Phase 2)
 *
 * Formally compares documentation claims (extracted by Subagent Beta / Symbiote)
 * against AST reality (extracted by Subagent Alpha / Morphologist) and code
 * reality (extracted by Symbiote's extractCodeClaims).
 *
 * Produces:
 *   - A typed DriftReport with every divergence point categorised, located,
 *     and accompanied by concrete doc-claim vs code-reality values.
 *   - A computed D_intent score (0.0 = no drift, 1.0 = total divergence).
 *   - An auto-patcher that updates outdated documentation in place, preserving
 *     all human formatting outside the patched value.
 *
 * DriftRecord kinds:
 *
 *   PORT_MISMATCH        -- doc claims port X, code binds to port Y
 *   ENV_VAR_UNDECLARED   -- code reads ENV_VAR not mentioned in any doc
 *   ENV_VAR_PHANTOM      -- doc declares ENV_VAR that code never reads
 *   HEADER_UNDOCUMENTED  -- code requires header not mentioned in any doc
 *   AUTH_SCHEME_MISMATCH -- doc claims scheme A, code uses scheme B
 *   ROUTE_UNDOCUMENTED   -- code defines route not in any OpenAPI spec
 *   ROUTE_PHANTOM        -- OpenAPI declares route absent from code
 *   SYMBOL_UNDOCUMENTED  -- exported symbol has no documentation reference
 *   SYMBOL_PHANTOM       -- doc references symbol not exported by code
 */

import fs from 'node:fs';
import path from 'node:path';
import { assertWithinRoot, tryWithinRoot, atomicWriteSync } from '../security/pathguard.js';
import { safeTest, createWordBoundaryRegExp, escapeRegExp } from '../security/redos.js';
import { trySync, safeGet } from '../security/errors.js';

// Normalisation helpers

/** Normalise an auth scheme string for comparison. */
function normaliseAuth(raw) {
  const s = String(raw).toLowerCase().replace(/[\s-]/g, '');
  if (s.includes('rsa')) return 'rsa';
  if (s.includes('hmac')) return 'hmac';
  if (s.includes('jwt') || s.includes('bearer')) return 'jwt';
  if (s.includes('apikey') || s.includes('api_key')) return 'apikey';
  if (s.includes('oauth')) return 'oauth2';
  if (s.includes('basic')) return 'basic';
  return s;
}

/** Normalise an HTTP header name for comparison. */
function normaliseHeader(raw) {
  return String(raw).toLowerCase().replace(/\s+/g, '-');
}

/** Normalise a route path for comparison (collapse param names). */
function normalisePath(raw) {
  // /users/:id and /users/{id} both become /users/:param
  return String(raw)
    .replace(/\{[^}]+\}/g, ':param')
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, ':param')
    .replace(/\/+$/, '')
    .toLowerCase();
}

// Severity assignment

/**
 * @typedef {'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'} Severity
 */

/** @type {Record<string, Severity>} */
const KIND_SEVERITY = {
  PORT_MISMATCH:         'CRITICAL',
  AUTH_SCHEME_MISMATCH:  'CRITICAL',
  ENV_VAR_UNDECLARED:    'HIGH',
  HEADER_UNDOCUMENTED:   'HIGH',
  ROUTE_UNDOCUMENTED:    'HIGH',
  ROUTE_PHANTOM:         'MEDIUM',
  ENV_VAR_PHANTOM:       'MEDIUM',
  SYMBOL_UNDOCUMENTED:   'LOW',
  SYMBOL_PHANTOM:        'LOW',
};

// D_intent score computation

/** Severity weights for D_intent calculation. */
const SEVERITY_WEIGHT = { CRITICAL: 1.0, HIGH: 0.6, MEDIUM: 0.3, LOW: 0.1 };

/**
 * Compute D_intent(I, S) in [0, 1].
 * Normalised by the total number of observable claims surfaces.
 *
 * @param {DriftRecord[]} records
 * @param {number} totalClaimSurfaces  -- denominator (total unique claims checked)
 * @returns {number}
 */
function computeDintent(records, totalClaimSurfaces) {
  if (totalClaimSurfaces === 0) return 0;
  const raw = records.reduce((sum, r) => sum + (SEVERITY_WEIGHT[r.severity] ?? 0.1), 0);
  return parseFloat(Math.min(raw / totalClaimSurfaces, 1).toFixed(6));
}

// Drift record typedef

/**
 * @typedef {{
 *   id: string,
 *   kind: string,
 *   severity: Severity,
 *   docValue: string,
 *   codeValue: string,
 *   sourceDocFile: string,
 *   sourceCodeFile: string,
 *   detail: string,
 *   autoPatchable: boolean,
 * }} DriftRecord
 *
 * @typedef {{
 *   schemaVersion: string,
 *   generatedAt: string,
 *   dIntentScore: number,
 *   totalClaimSurfaces: number,
 *   driftRecords: DriftRecord[],
 *   patchesApplied: PatchRecord[],
 *   summary: {
 *     totalDriftCount: number,
 *     criticalCount: number,
 *     highCount: number,
 *     mediumCount: number,
 *     lowCount: number,
 *     autoPatchedCount: number,
 *   },
 * }} DriftReport
 *
 * @typedef {{
 *   file: string,
 *   driftId: string,
 *   oldValue: string,
 *   newValue: string,
 *   lineNumber: number,
 * }} PatchRecord
 */

// Core comparators

let _idSeq = 0;
function nextId(kind) {
  return `DRIFT-${kind.split('_').map(s => s[0]).join('')}-${String(++_idSeq).padStart(3, '0')}`;
}

/**
 * Compare port bindings: doc claims vs code reality.
 * @param {string[]} docPorts
 * @param {string[]} codePorts
 * @param {string} docFile
 * @param {string[]} codeFiles
 * @returns {DriftRecord[]}
 */
function comparePortBindings(docPorts, codePorts, docFile, codeFiles) {
  const records = [];
  const codeSet = new Set(codePorts);
  const docSet  = new Set(docPorts);
  const codeFile = codeFiles[0] || 'unknown';

  for (const docPort of docSet) {
    if (!codeSet.has(docPort)) {
      // Check whether any code port exists at all
      const codeVal = codePorts.length > 0 ? codePorts.join(', ') : 'none detected';
      records.push({
        id:             nextId('PORT_MISMATCH'),
        kind:           'PORT_MISMATCH',
        severity:       KIND_SEVERITY.PORT_MISMATCH,
        docValue:       docPort,
        codeValue:      codeVal,
        sourceDocFile:  docFile,
        sourceCodeFile: codeFile,
        detail:         `Documentation claims port ${docPort} but code binds to: ${codeVal}.`,
        autoPatchable:  codePorts.length === 1, // safe only when unambiguous
      });
    }
  }

  return records;
}

/**
 * Compare environment variable declarations: doc vs code.
 * @param {string[]} docVars
 * @param {string[]} codeVars
 * @param {string} docFile
 * @param {string} codeFile
 * @returns {DriftRecord[]}
 */
function compareEnvVars(docVars, codeVars, docFile, codeFile) {
  const records = [];
  const docSet  = new Set(docVars);
  const codeSet = new Set(codeVars);

  // Code reads vars not documented
  for (const v of codeSet) {
    if (!docSet.has(v)) {
      records.push({
        id:             nextId('ENV_VAR_UNDECLARED'),
        kind:           'ENV_VAR_UNDECLARED',
        severity:       KIND_SEVERITY.ENV_VAR_UNDECLARED,
        docValue:       'not documented',
        codeValue:      v,
        sourceDocFile:  docFile,
        sourceCodeFile: codeFile,
        detail:         `Code reads env var '${v}' which is not declared in documentation.`,
        autoPatchable:  false,
      });
    }
  }

  // Docs declare vars code never reads
  for (const v of docSet) {
    if (!codeSet.has(v)) {
      records.push({
        id:             nextId('ENV_VAR_PHANTOM'),
        kind:           'ENV_VAR_PHANTOM',
        severity:       KIND_SEVERITY.ENV_VAR_PHANTOM,
        docValue:       v,
        codeValue:      'not used in code',
        sourceDocFile:  docFile,
        sourceCodeFile: codeFile,
        detail:         `Documentation declares env var '${v}' but code never references it.`,
        autoPatchable:  false,
      });
    }
  }

  return records;
}

/**
 * Compare required headers: doc vs code.
 * @param {string[]} docHeaders
 * @param {string[]} codeHeaders
 * @param {string} docFile
 * @param {string} codeFile
 * @returns {DriftRecord[]}
 */
function compareHeaders(docHeaders, codeHeaders, docFile, codeFile) {
  const records = [];
  const docSet  = new Set(docHeaders.map(normaliseHeader));
  const codeSet = new Set(codeHeaders.map(normaliseHeader));

  for (const h of codeSet) {
    if (!docSet.has(h)) {
      records.push({
        id:             nextId('HEADER_UNDOCUMENTED'),
        kind:           'HEADER_UNDOCUMENTED',
        severity:       KIND_SEVERITY.HEADER_UNDOCUMENTED,
        docValue:       'not documented',
        codeValue:      h,
        sourceDocFile:  docFile,
        sourceCodeFile: codeFile,
        detail:         `Code requires header '${h}' which is absent from all documentation.`,
        autoPatchable:  false,
      });
    }
  }

  return records;
}

/**
 * Compare authentication schemes: doc vs code.
 * @param {string[]} docSchemes
 * @param {string[]} codeSchemes
 * @param {string} docFile
 * @param {string} codeFile
 * @returns {DriftRecord[]}
 */
function compareAuthSchemes(docSchemes, codeSchemes, docFile, codeFile) {
  const records = [];
  if (docSchemes.length === 0 || codeSchemes.length === 0) return records;

  const docNorm  = new Set(docSchemes.map(normaliseAuth));
  const codeNorm = new Set(codeSchemes.map(normaliseAuth));

  for (const codeScheme of codeNorm) {
    if (!docNorm.has(codeScheme)) {
      records.push({
        id:             nextId('AUTH_SCHEME_MISMATCH'),
        kind:           'AUTH_SCHEME_MISMATCH',
        severity:       KIND_SEVERITY.AUTH_SCHEME_MISMATCH,
        docValue:       [...docNorm].join(', '),
        codeValue:      codeScheme,
        sourceDocFile:  docFile,
        sourceCodeFile: codeFile,
        detail:         `Code uses auth scheme '${codeScheme}' but documentation claims: ${[...docNorm].join(', ')}.`,
        autoPatchable:  true,
      });
    }
  }

  return records;
}

/**
 * Compare API routes: OpenAPI declared routes vs code route manifest.
 * @param {{ path: string, method: string, sourceFile: string }[]} docRoutes
 * @param {{ file: string, method: string, excerpt: string }[]} codeRoutes
 * @returns {DriftRecord[]}
 */
function compareRoutes(docRoutes, codeRoutes) {
  const records = [];

  // Build normalised sets
  const docSet = new Map();
  for (const r of docRoutes) {
    const key = `${r.method.toUpperCase()}:${normalisePath(r.path)}`;
    docSet.set(key, r);
  }

  const codeSet = new Map();
  for (const r of codeRoutes) {
    const rawPath = r.excerpt?.match(/['"`](\/[^'"`]+)['"`]/)?.[1];
    if (!rawPath) continue;
    const key = `${r.method.toUpperCase()}:${normalisePath(rawPath)}`;
    codeSet.set(key, { ...r, rawPath });
  }

  // Routes in code, absent from docs
  for (const [key, r] of codeSet) {
    if (!docSet.has(key)) {
      records.push({
        id:             nextId('ROUTE_UNDOCUMENTED'),
        kind:           'ROUTE_UNDOCUMENTED',
        severity:       KIND_SEVERITY.ROUTE_UNDOCUMENTED,
        docValue:       'not in OpenAPI spec',
        codeValue:      key,
        sourceDocFile:  'openapi spec',
        sourceCodeFile: safeGet(r, 'file', 'unknown'),
        detail:         `Route ${key} exists in code (${safeGet(r, 'file')}) but is absent from all OpenAPI specs.`,
        autoPatchable:  false,
      });
    }
  }

  // Routes in docs, absent from code
  for (const [key, r] of docSet) {
    if (!codeSet.has(key)) {
      records.push({
        id:             nextId('ROUTE_PHANTOM'),
        kind:           'ROUTE_PHANTOM',
        severity:       KIND_SEVERITY.ROUTE_PHANTOM,
        docValue:       key,
        codeValue:      'not implemented',
        sourceDocFile:  safeGet(r, 'sourceFile', 'unknown'),
        sourceCodeFile: 'none',
        detail:         `OpenAPI spec declares ${key} in '${safeGet(r, 'sourceFile')}' but no corresponding route exists in code.`,
        autoPatchable:  false,
      });
    }
  }

  return records;
}

/**
 * Compare documented symbol exports vs code exports.
 * @param {string[]} docSymbols
 * @param {string[]} codeExports
 * @param {string} docFile
 * @param {string} codeFile
 * @returns {DriftRecord[]}
 */
function compareSymbols(docSymbols, codeExports, docFile, codeFile) {
  const records = [];
  const docSet  = new Set(docSymbols);
  const codeSet = new Set(codeExports);

  for (const sym of codeSet) {
    if (!docSet.has(sym)) {
      records.push({
        id:             nextId('SYMBOL_UNDOCUMENTED'),
        kind:           'SYMBOL_UNDOCUMENTED',
        severity:       KIND_SEVERITY.SYMBOL_UNDOCUMENTED,
        docValue:       'not referenced in docs',
        codeValue:      sym,
        sourceDocFile:  docFile,
        sourceCodeFile: codeFile,
        detail:         `Exported symbol '${sym}' in '${codeFile}' has no documentation reference.`,
        autoPatchable:  false,
      });
    }
  }

  for (const sym of docSet) {
    if (!codeSet.has(sym)) {
      records.push({
        id:             nextId('SYMBOL_PHANTOM'),
        kind:           'SYMBOL_PHANTOM',
        severity:       KIND_SEVERITY.SYMBOL_PHANTOM,
        docValue:       sym,
        codeValue:      'not exported',
        sourceDocFile:  docFile,
        sourceCodeFile: codeFile,
        detail:         `Documentation references '${sym}' but no matching export exists in code.`,
        autoPatchable:  false,
      });
    }
  }

  return records;
}

// Auto-patcher

/**
 * Locate the first occurrence of `oldValue` in `fileContent` as a standalone
 * word/token and return the 1-based line number, or -1 if not found.
 *
 * Uses safe regex construction to prevent ReDoS, with fallback to string search.
 *
 * @param {string} fileContent
 * @param {string} oldValue
 * @returns {number}
 */
function findLineNumber(fileContent, oldValue) {
  // SEC: guard against pathological inputs that would make the regex catastrophic
  if (typeof oldValue !== 'string' || oldValue.length === 0 || oldValue.length > 256) return -1;
  const lines = fileContent.split('\n');
  
  // Try word-boundary regex first
  const escaped = escapeRegExp(oldValue);
  const re = createWordBoundaryRegExp(escaped);
  for (let i = 0; i < lines.length; i++) {
    if (safeTest(re, lines[i])) return i + 1;
  }
  
  // Fallback: simple string search (handles edge cases like punctuation, line endings)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(oldValue)) return i + 1;
  }
  
  return -1;
}

/**
 * Apply an in-place patch to a single documentation file.
 * Replaces the first standalone occurrence of `oldValue` with `newValue`
 * while leaving all surrounding formatting intact.
 *
 * @param {string} filePath      -- absolute path to the doc file
 * @param {string} oldValue      -- the string value to replace
 * @param {string} newValue      -- the replacement string
 * @param {string} driftId       -- ID of the drift record triggering this patch
 * @returns {PatchRecord | null}
 */
function applyPatch(filePath, oldValue, newValue, driftId) {
  // SEC: validate that the file path stays within the working directory
  const resolvedPath = path.resolve(filePath);
  const cwd          = process.cwd();
  const rel          = path.relative(cwd, resolvedPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;

  // SEC: clamp string lengths to prevent ReDoS / OOM
  if (typeof oldValue !== 'string' || oldValue.length === 0 || oldValue.length > 256) return null;
  if (typeof newValue !== 'string' || newValue.length > 256) return null;

  const contentResult = trySync(() => fs.readFileSync(resolvedPath, 'utf8'));
  if (contentResult.isErr()) return null;
  let content = contentResult.unwrap();

  // SEC: size guard on the file being patched
  if (content.length > 4 * 1024 * 1024) return null;

  const lineNumber = findLineNumber(content, oldValue);
  if (lineNumber === -1) return null;

  const escaped = escapeRegExp(oldValue);
  // Try word-boundary regex first
  let re = createWordBoundaryRegExp(escaped);
  let patched = content.replace(re, newValue);
  
  // Fallback: if regex didn't match, use simple string replace (first occurrence only)
  if (patched === content) {
    const idx = content.indexOf(oldValue);
    if (idx !== -1) {
      patched = content.slice(0, idx) + newValue + content.slice(idx + oldValue.length);
    }
  }
  
  if (patched === content) return null;

  const writeResult = trySync(() => fs.writeFileSync(resolvedPath, patched, 'utf8'));
  if (writeResult.isErr()) return null;

  return { file: resolvedPath, driftId, oldValue, newValue, lineNumber };
}

/**
 * Run the auto-patcher over all patchable drift records.
 *
 * @param {DriftRecord[]} records
 * @param {string} rootDir
 * @returns {PatchRecord[]}
 */
function runAutoPatcher(records, rootDir) {
  const patches  = [];
  const resolved = path.resolve(rootDir);

  for (const record of records) {
    if (!record.autoPatchable) continue;

    // SEC: validate sourceDocFile is a simple relative path (no absolute / traversal)
    const docFile = record.sourceDocFile;
    if (!docFile || typeof docFile !== 'string') continue;
    if (path.isAbsolute(docFile)) continue;

    const absPath = path.resolve(resolved, docFile);
    // SEC: ensure the patch target stays within rootDir
    const rel = path.relative(resolved, absPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;

    if (record.kind === 'PORT_MISMATCH' && record.codeValue && record.codeValue !== 'none detected') {
      const patch = applyPatch(absPath, record.docValue, record.codeValue, record.id);
      if (patch) patches.push(patch);
    }
    if (record.kind === 'AUTH_SCHEME_MISMATCH') {
      const firstDocScheme = (typeof record.docValue === 'string' ? record.docValue : '').split(', ')[0];
      if (firstDocScheme) {
        const patch = applyPatch(absPath, firstDocScheme, record.codeValue, record.id);
        if (patch) patches.push(patch);
      }
    }
  }

  return patches;
}

// Main entry point

/**
 * Run the Drift Engine: compare Symbiote doc claims against Morphologist AST
 * reality + code claims to produce a complete DriftReport.
 *
 * @param {{
 *   symbioteReport: import('../agents/symbiote.js').SymbioteReport,
 *   morphReport: import('../agents/morphologist.js').runMorphologist,
 *   rootDir: string,
 *   applyPatches?: boolean,
 * }} options
 * @returns {DriftReport}
 */
export function runDriftEngine({
  symbioteReport,
  morphReport,
  rootDir,
  applyPatches = false,
}) {
  _idSeq = 0; // reset ID sequence for deterministic output in tests

  const agg       = symbioteReport.aggregated;
  const codeClaims = symbioteReport.codeClaims;

  const allRecords = [];

  // ---- 1. Port bindings ----
  const allCodePorts = [...new Set(codeClaims.flatMap(c => c.portBindings))];
  const primaryDocFile = symbioteReport.proseClaims[0]?.sourceFile
    || symbioteReport.openApiClaims[0]?.sourceFile
    || 'docs';

  if (agg.allPorts.length > 0 || allCodePorts.length > 0) {
    allRecords.push(
      ...comparePortBindings(agg.allPorts, allCodePorts, primaryDocFile,
        codeClaims.map(c => c.sourceFile))
    );
  }

  // ---- 2. Environment variables ----
  const allCodeEnv = [...new Set(codeClaims.flatMap(c => c.envVars))];
  allRecords.push(
    ...compareEnvVars(agg.allEnvVars, allCodeEnv, primaryDocFile,
      codeClaims.map(c => c.sourceFile).join(', '))
  );

  // ---- 3. Required headers ----
  const allCodeHeaders = [...new Set(codeClaims.flatMap(c => c.requiredHeaders))];
  allRecords.push(
    ...compareHeaders(agg.allHeaders, allCodeHeaders, primaryDocFile,
      codeClaims.map(c => c.sourceFile).join(', '))
  );

  // ---- 4. Auth schemes ----
  const allCodeAuth = [...new Set(codeClaims.flatMap(c => c.authSchemes))];
  allRecords.push(
    ...compareAuthSchemes(agg.allAuthSchemes, allCodeAuth, primaryDocFile,
      codeClaims.map(c => c.sourceFile).join(', '))
  );

  // ---- 5. Route coverage ----
  if (morphReport?.routeManifest) {
    allRecords.push(
      ...compareRoutes(agg.allRoutes, morphReport.routeManifest)
    );
  }

  // ---- 6. Symbol coverage ----
  if (morphReport?.componentTopology) {
    const allDocSymbols = [
      ...symbioteReport.proseClaims.flatMap(c =>
        [...c.rawText.matchAll(/`([A-Za-z_$][A-Za-z0-9_$.]*)`/g)].map(m => m[1])
      ),
    ];
    for (const topo of morphReport.componentTopology) {
      allRecords.push(
        ...compareSymbols(allDocSymbols, topo.exports, primaryDocFile, topo.path)
      );
    }
  }

  // ---- D_intent score ----
  const totalClaimSurfaces = Math.max(
    agg.allPorts.length + agg.allEnvVars.length + agg.allHeaders.length +
    agg.allAuthSchemes.length + agg.allRoutes.length + 1,
    1
  );
  const dIntentScore = computeDintent(allRecords, totalClaimSurfaces);

  // ---- Auto-patch patchable records ----
  const patchesApplied = applyPatches
    ? runAutoPatcher(allRecords, path.resolve(rootDir))
    : [];

  const summary = {
    totalDriftCount:  allRecords.length,
    criticalCount:    allRecords.filter(r => r.severity === 'CRITICAL').length,
    highCount:        allRecords.filter(r => r.severity === 'HIGH').length,
    mediumCount:      allRecords.filter(r => r.severity === 'MEDIUM').length,
    lowCount:         allRecords.filter(r => r.severity === 'LOW').length,
    autoPatchedCount: patchesApplied.length,
  };

  return {
    schemaVersion:      '1.0.0',
    generatedAt:        new Date().toISOString(),
    dIntentScore,
    totalClaimSurfaces,
    driftRecords:       allRecords,
    patchesApplied,
    summary,
  };
}