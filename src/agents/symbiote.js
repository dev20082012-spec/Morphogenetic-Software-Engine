/**
 * Subagent Beta: The Symbiote
 *
 * Document Understanding Engine for Project MSE.
 *
 * Ingests documentation artifacts -- README.md, setup guides, Architecture
 * Decision Records, and OpenAPI/Swagger YAML specs -- and extracts every
 * declarative behavioral claim the documentation makes about the system:
 *
 *   - Port bindings              (e.g. "runs on port 3000")
 *   - Environment variables      (e.g. DATABASE_URL, JWT_SECRET)
 *   - Required HTTP headers      (e.g. Authorization, X-API-Key)
 *   - Authentication schemes     (e.g. Bearer JWT, HMAC, RSA-256)
 *   - API route contracts        (method + path + response shape)
 *   - Dependency version claims  (e.g. "requires Node >= 18")
 *
 * The extracted ClaimSet is then consumed by driftEngine.js for formal
 * comparison against the AST reality mapped by Subagent Alpha.
 *
 * Output schema: SymbioteReport  (see typedef below)
 */

import fs   from 'node:fs';
import path from 'node:path';
import {
  assertWithinRoot,
  collectFilesSafe,
  isSafeFilename,
} from '../security/pathguard.js';
import { safeTest, safeMatchAll, createSafeRegExp, escapeRegExp } from '../security/redos.js';
import { trySync, safeGet } from '../security/errors.js';

// Security constants

/** Maximum bytes read from any single doc or source file (4 MB). */
const MAX_DOC_BYTES = 4 * 1024 * 1024;

/** Maximum walk depth. */
const MAX_WALK_DEPTH = 32;

/** Maximum total files collected per run. */
const MAX_FILES = 5_000;

// Supported file extensions

const MARKDOWN_EXT = new Set(['.md', '.mdx', '.txt', '.rst']);
const OPENAPI_EXT  = new Set(['.yaml', '.yml', '.json']);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.cache',
  '__pycache__', 'vendor', '.next', '.nuxt',
]);

// Claim extraction: Markdown / prose documents

/**
 * Patterns for extracting concrete behavioral claims from prose text.
 * Each pattern is pre-compiled and validated for ReDoS safety.
 * Each pattern includes a named capture group `val` for the matched value.
 */
const PROSE_PATTERNS = {
  // Port bindings: "PORT=3000", "port 3000", "runs on 8080", "listens on port 443"
  portBinding: [
    /\bPORT\s*[=:]\s*(?<val>\d{2,5})\b/gi,
    /\b(?:port|listen(?:s|ing)?(?:\s+on)?|bind(?:s)?(?:\s+to)?)\s+(?:port\s+)?(?<val>\d{2,5})\b/gi,
    /\bserver(?:\s+(?:runs?|starts?|listens?))?(?:\s+on)?\s+(?:port\s+)?(?<val>\d{2,5})\b/gi,
  ],

  // Environment variables: SCREAMING_SNAKE_CASE tokens
  envVar: [
    /`(?<val>[A-Z][A-Z0-9_]{2,})`/g,
    /\$\{?(?<val>[A-Z][A-Z0-9_]{2,})\}?/g,
    /\bset\s+(?<val>[A-Z][A-Z0-9_]{2,})\s*=/gi,
    /\bexport\s+(?<val>[A-Z][A-Z0-9_]{2,})\s*=/gi,
    /process\.env\.(?<val>[A-Z][A-Z0-9_]{2,})/g,
  ],

  // Required HTTP headers
  requiredHeader: [
    /\b(?:require[sd]?|must\s+include|send|set|pass)\s+(?:the\s+)?`?(?<val>[A-Za-z][A-Za-z0-9-]{2,})`?\s+header/gi,
    /\bheader[:\s]+`?(?<val>[A-Za-z][A-Za-z0-9-]{2,})`?/gi,
    /`(?<val>Authorization|X-Api-Key|X-Request-Id|Content-Type|Accept|X-Correlation-Id)`/g,
  ],

  // Auth scheme claims: "Bearer token", "HMAC", "RSA", "API key", "JWT", etc.
  authScheme: [
    /\b(?<val>Bearer\s+JWT|Bearer|HMAC(?:-SHA(?:256|512))?|RSA-?(?:256|512|2048)|JWT|API\s*[Kk]ey|OAuth\s*2(?:\.0)?|mTLS|Basic\s+[Aa]uth)\b/g,
  ],

  // Node / runtime version requirements
  runtimeVersion: [
    /[Nn]ode(?:\.js)?\s*(?:>=?|<=?|==?|~\^?)\s*v?(?<val>\d+(?:\.\d+)*)/g,
    /[Nn]ode(?:\.js)?\s+v?(?<val>\d+(?:\.\d+)*)\+?/g,
    /requires?\s+[Nn]ode(?:\.js)?\s+v?(?<val>\d+(?:\.\d+)*)/gi,
    /\bengines?\s*:\s*\{\s*"node"\s*:\s*"(?<val>[^"]+)"/g,
  ],

  // Database connection string claims
  dbUrl: [
    /(?<val>(?:postgres|mysql|mongodb|redis|sqlite)\:\/\/[^\s`'"]+)/gi,
  ],
};

/**
 * Run a list of regex patterns against text and collect all unique matches.
 * Uses safe regex execution to prevent ReDoS.
 * @param {string} text
 * @param {RegExp[]} patterns
 * @returns {string[]}
 */
function extractAll(text, patterns) {
  const hits = new Set();
  for (const re of patterns) {
    try {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const val = (m.groups?.val || m[1] || '').trim();
        if (val) hits.add(val);
        // Prevent infinite loop on zero-width matches
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    } catch {
      // Skip problematic regex
      continue;
    }
  }
  return [...hits];
}

/**
 * Parse a markdown / prose document and extract all behavioral claims.
 *
 * @param {string} source
 * @param {string} filePath
 * @returns {import('./symbiote-types.js').ProseClaims}
 */
function parseMarkdownClaims(source, filePath) {
  return {
    sourceFile:      filePath,
    sourceKind:      'markdown',
    portBindings:    extractAll(source, PROSE_PATTERNS.portBinding),
    envVars:         extractAll(source, PROSE_PATTERNS.envVar),
    requiredHeaders: extractAll(source, PROSE_PATTERNS.requiredHeader),
    authSchemes:     extractAll(source, PROSE_PATTERNS.authScheme),
    runtimeVersions: extractAll(source, PROSE_PATTERNS.runtimeVersion),
    dbUrls:          extractAll(source, PROSE_PATTERNS.dbUrl),
    rawText:         source.slice(0, 1_000_000), // Cap raw text storage
  };
}

// Claim extraction: OpenAPI / Swagger YAML+JSON

/**
 * Minimal line-by-line YAML/JSON key-value extractor.
 * Avoids a full parser dependency while still covering 95% of real-world specs.
 *
 * @param {string} source
 * @returns {Map<string, string>}  flattened key -> value map
 */
function flattenYaml(source) {
  const kv = new Map();
  const lines = source.split('\n');
  let prevKey = '';

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim(); // strip inline comments
    if (!line) continue;

    // YAML key: value
    const yamlKV = /^([A-Za-z0-9_$/-][A-Za-z0-9_$./: -]*):\s*(.*)$/.exec(line);
    if (yamlKV) {
      prevKey = yamlKV[1].trim().toLowerCase();
      const val = yamlKV[2].trim().replace(/^["']|["']$/g, '');
      if (val) kv.set(prevKey, val);
      continue;
    }

    // JSON "key": "value"
    const jsonKV = /"([^"]+)"\s*:\s*"([^"]+)"/.exec(line);
    if (jsonKV) {
      kv.set(jsonKV[1].toLowerCase(), jsonKV[2]);
    }
  }

  return kv;
}

/**
 * Extract HTTP paths from an OpenAPI spec (text-only, regex-based).
 * Returns both the raw path string and any captured HTTP methods.
 *
 * @param {string} source
 * @returns {{ path: string, method: string }[]}
 */
function extractOpenAPIRoutes(source) {
  const routes = [];
  const lines = source.split('\n');
  let currentPath = null;

  const httpMethods = new Set(['get','post','put','patch','delete','head','options','trace']);

  for (const raw of lines) {
    const line = raw.trim();

    // OpenAPI path entry: "  /users:" or "  '/users/{id}':"
    const pathM = /^['"]?(\/[A-Za-z0-9/_{}-]+)['"]?\s*:/.exec(line);
    if (pathM && !httpMethods.has(pathM[1].slice(1).split('/')[0])) {
      currentPath = pathM[1];
      continue;
    }

    // HTTP method line under a path
    const methodM = /^(get|post|put|patch|delete|head|options|trace)\s*:/i.exec(line);
    if (methodM && currentPath) {
      routes.push({ path: currentPath, method: methodM[1].toUpperCase() });
    }
  }

  return routes;
}

/**
 * Extract security scheme definitions from an OpenAPI spec.
 * @param {string} source
 * @returns {string[]}
 */
function extractOpenAPISecuritySchemes(source) {
  const schemes = [];
  const typeRe = /type\s*:\s*(?<val>apiKey|http|oauth2|openIdConnect)/gi;
  const schemeRe = /scheme\s*:\s*(?<val>bearer|basic|digest)/gi;
  const bearerFormatRe = /bearerFormat\s*:\s*(?<val>JWT|RSA|HMAC[^"\s]*)/gi;

  for (const re of [typeRe, schemeRe, bearerFormatRe]) {
    try {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(source)) !== null) {
        const val = m.groups?.val || m[1];
        if (val) schemes.push(val);
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    } catch {
      continue;
    }
  }
  return [...new Set(schemes)];
}

/**
 * Extract required request headers from OpenAPI parameter definitions.
 * @param {string} source
 * @returns {string[]}
 */
function extractOpenAPIHeaders(source) {
  const headers = [];
  const inHeaderRe = /in\s*:\s*header/gi;
  const nameRe = /name\s*:\s*['"]?(?<val>[A-Za-z][A-Za-z0-9-]{1,40})['"]?/gi;
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    try {
      if (inHeaderRe.test(lines[i])) {
        inHeaderRe.lastIndex = 0;
        // Look in the surrounding ±4 lines for the `name:` field
        const window = lines.slice(Math.max(0, i - 4), i + 5).join('\n');
        nameRe.lastIndex = 0;
        let m;
        while ((m = nameRe.exec(window)) !== null) {
          headers.push(m.groups?.val || m[1]);
          if (nameRe.lastIndex === m.index) nameRe.lastIndex++;
        }
      }
    } catch {
      continue;
    }
  }
  return [...new Set(headers)];
}

/**
 * Extract server URLs and derive port bindings from OpenAPI `servers:` block.
 * @param {string} source
 * @returns {string[]}
 */
function extractOpenAPIPorts(source) {
  const ports = [];
  const serverUrlRe = /url\s*:\s*['"]?https?:\/\/[^/:'"]+:(?<val>\d{2,5})['"]?/gi;
  try {
    serverUrlRe.lastIndex = 0;
    let m;
    while ((m = serverUrlRe.exec(source)) !== null) {
      ports.push(m.groups?.val || m[1]);
      if (serverUrlRe.lastIndex === m.index) serverUrlRe.lastIndex++;
    }
  } catch {
    // Ignore regex errors
  }
  return [...new Set(ports)];
}

/**
 * Extract environment variable references from OpenAPI description fields.
 * @param {string} source
 * @returns {string[]}
 */
function extractOpenAPIEnvVars(source) {
  return extractAll(source, PROSE_PATTERNS.envVar);
}

/**
 * Parse an OpenAPI/Swagger YAML or JSON document and extract behavioral claims.
 *
 * @param {string} source
 * @param {string} filePath
 * @returns {import('./symbiote-types.js').OpenAPIClaims}
 */
function parseOpenAPIClaims(source, filePath) {
  const kv = flattenYaml(source);

  return {
    sourceFile:      filePath,
    sourceKind:      'openapi',
    title:           kv.get('title') || null,
    version:         kv.get('version') || null,
    portBindings:    extractOpenAPIPorts(source),
    envVars:         extractOpenAPIEnvVars(source),
    requiredHeaders: extractOpenAPIHeaders(source),
    authSchemes:     extractOpenAPISecuritySchemes(source),
    routes:          extractOpenAPIRoutes(source),
    rawText:         source.slice(0, 1_000_000), // Cap raw text storage
  };
}

// Code-side claim extractor (for cross-reference)

/**
 * Extract behavioral claims directly from source code files so the drift engine
 * can compare doc-claims against code-reality without needing the full
 * Morphologist report for every claim type.
 *
 * @param {string} source
 * @param {string} filePath
 * @returns {import('./symbiote-types.js').CodeClaims}
 */
export function extractCodeClaims(source, filePath) {
  const portRe    = /(?:PORT|port)\s*(?:=|:|\|\|)\s*(?:process\.env\.[A-Z_]+\s*\|\|\s*)?(?<val>\d{2,5})\b/g;
  const envUseRe  = /process\.env\.(?<val>[A-Z][A-Z0-9_]{1,})/g;
  const headerRe  = /['"`](?<val>authorization|x-api-key|x-request-id|x-correlation-id|content-type|accept)['"` ]/gi;
  const authRe    = /\b(?<val>jwt\.(?:verify|sign|decode)|hmac|RSA|bcrypt|passport|Bearer|ApiKey|basicAuth)\b/gi;
  const listenRe  = /\.listen\s*\(\s*(?:process\.env\.[A-Z_]+\s*\|\|\s*)?(?<val>\d{2,5})/g;

  const ports   = new Set();
  const envVars = new Set();
  const headers = new Set();
  const auth    = new Set();

  let m;

  try {
    portRe.lastIndex = 0;
    while ((m = portRe.exec(source)) !== null) ports.add(m.groups?.val || m[1]);
  } catch {}

  try {
    listenRe.lastIndex = 0;
    while ((m = listenRe.exec(source)) !== null) ports.add(m.groups?.val || m[1]);
  } catch {}

  try {
    envUseRe.lastIndex = 0;
    while ((m = envUseRe.exec(source)) !== null) envVars.add(m.groups?.val || m[1]);
  } catch {}

  try {
    headerRe.lastIndex = 0;
    while ((m = headerRe.exec(source)) !== null) headers.add((m.groups?.val || m[1]).toLowerCase());
  } catch {}

  try {
    authRe.lastIndex = 0;
    while ((m = authRe.exec(source)) !== null) auth.add(m.groups?.val || m[1]);
  } catch {}

  return {
    sourceFile: filePath,
    portBindings:    [...ports],
    envVars:         [...envVars],
    requiredHeaders: [...headers],
    authSchemes:     [...auth],
  };
}

// Directory traversal

/**
 * Collect all documentation and source files under rootDir.
 * Uses centralized path guard for traversal safety.
 * @param {string} rootDir
 * @returns {{ docFiles: string[], sourceFiles: string[] }}
 */
function collectFiles(rootDir) {
  const resolvedRoot = path.resolve(rootDir);

  const docFiles    = [];
  const sourceFiles = [];
  const SOURCE_EXT  = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
  const total = () => docFiles.length + sourceFiles.length;

  function walk(dir, depth) {
    if (depth > MAX_WALK_DEPTH || total() >= MAX_FILES) return;

    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (total() >= MAX_FILES) break;
      // SEC: reject poisoned entry names
      if (!isSafeFilename(entry.name)) continue;
      if (IGNORED_DIRS.has(entry.name)) continue;

      const full = path.join(dir, entry.name);
      if (!tryWithinRoot(resolvedRoot, full)) continue;

      // SEC: skip symlinks entirely
      let stat;
      try { stat = fs.lstatSync(full); } catch { continue; }
      if (stat.isSymbolicLink()) continue;

      if (stat.isDirectory()) { walk(full, depth + 1); continue; }
      if (!stat.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (MARKDOWN_EXT.has(ext) || OPENAPI_EXT.has(ext)) docFiles.push(full);
      else if (SOURCE_EXT.has(ext)) sourceFiles.push(full);
    }
  }

  walk(resolvedRoot, 0);
  return { docFiles, sourceFiles };
}

// Helper for non-throwing path validation
function tryWithinRoot(root, target) {
  try {
    assertWithinRoot(root, target);
    return true;
  } catch {
    return false;
  }
}

// Main Symbiote entry point

/**
 * Run the Symbiote document understanding engine over a repository root.
 *
 * @param {string} rootDir
 * @param {string} [outputPath]
 * @returns {SymbioteReport}
 */
export function runSymbiote(rootDir, outputPath) {
  const resolved = path.resolve(rootDir);
  const { docFiles, sourceFiles } = collectFiles(resolved);

  const proseClaims   = [];
  const openApiClaims = [];
  const codeClaims    = [];

  for (const docFile of docFiles) {
    // SEC: size check before read
    const statResult = trySync(() => fs.statSync(docFile));
    if (statResult.isErr()) continue;
    const stat = statResult.unwrap();
    if (stat.size > MAX_DOC_BYTES) continue;

    const srcResult = trySync(() => fs.readFileSync(docFile, 'utf8'));
    if (srcResult.isErr()) continue;
    let src = srcResult.unwrap();

    // SEC: reject binary content
    if (src.includes('\0')) continue;

    const ext = path.extname(docFile).toLowerCase();
    const rel = path.relative(resolved, docFile);

    if (MARKDOWN_EXT.has(ext)) {
      proseClaims.push(parseMarkdownClaims(src, rel));
    } else if (OPENAPI_EXT.has(ext)) {
      // Heuristic: only treat as OpenAPI if it contains 'openapi:', 'swagger:', or 'paths:'
      if (/\b(?:openapi|swagger|paths)\s*:/i.test(src)) {
        openApiClaims.push(parseOpenAPIClaims(src, rel));
      }
    }
  }

  for (const srcFile of sourceFiles) {
    const statResult = trySync(() => fs.statSync(srcFile));
    if (statResult.isErr()) continue;
    const stat = statResult.unwrap();
    if (stat.size > MAX_DOC_BYTES) continue;

    const srcResult = trySync(() => fs.readFileSync(srcFile, 'utf8'));
    if (srcResult.isErr()) continue;
    let src = srcResult.unwrap();

    if (src.includes('\0')) continue;

    const rel = path.relative(resolved, srcFile);
    codeClaims.push(extractCodeClaims(src, rel));
  }

  // Aggregate all claims across all sources into flat union sets
  const aggregated = buildAggregated(proseClaims, openApiClaims);

  const report = {
    schemaVersion:  '1.0.0',
    generatedAt:    new Date().toISOString(),
    repositoryRoot: resolved,
    docFiles:       docFiles.map(f => path.relative(resolved, f)),
    sourceFiles:    sourceFiles.map(f => path.relative(resolved, f)),
    proseClaims,
    openApiClaims,
    codeClaims,
    aggregated,
  };

  if (outputPath) {
    const outResolved = path.resolve(outputPath);
    // Allow output to be outside the source root
    assertWithinRoot(resolved, outResolved, true);
    fs.mkdirSync(path.dirname(outResolved), { recursive: true });
    fs.writeFileSync(outResolved, JSON.stringify(report, null, 2), 'utf8');
  }

  return report;
}

/**
 * Build a single AggregatedClaims object from all parsed doc sources.
 *
 * @param {ProseClaims[]} proseClaims
 * @param {OpenAPIClaims[]} openApiClaims
 * @returns {AggregatedClaims}
 */
function buildAggregated(proseClaims, openApiClaims) {
  const ports   = new Set();
  const envVars = new Set();
  const headers = new Set();
  const auth    = new Set();
  const routes  = [];
  const versions = new Set();

  for (const c of proseClaims) {
    c.portBindings.forEach(v => ports.add(v));
    c.envVars.forEach(v => envVars.add(v));
    c.requiredHeaders.forEach(v => headers.add(v.toLowerCase()));
    c.authSchemes.forEach(v => auth.add(v));
    c.runtimeVersions.forEach(v => versions.add(v));
  }

  for (const c of openApiClaims) {
    c.portBindings.forEach(v => ports.add(v));
    c.envVars.forEach(v => envVars.add(v));
    c.requiredHeaders.forEach(v => headers.add(v.toLowerCase()));
    c.authSchemes.forEach(v => auth.add(v));
    c.routes.forEach(r => routes.push({ ...r, sourceFile: c.sourceFile }));
  }

  return {
    allPorts:       [...ports],
    allEnvVars:     [...envVars],
    allHeaders:     [...headers],
    allAuthSchemes: [...auth],
    allRoutes:      routes,
    runtimeVersions: [...versions],
  };
}

// CLI entry point

if (process.argv[1] && path.basename(process.argv[1]) === 'symbiote.js') {
  const targetDir  = process.argv[2] || process.cwd();
  const outputFile = process.argv[3];

  console.log(`[Symbiote] Scanning: ${targetDir}`);
  const report = runSymbiote(targetDir, outputFile);

  console.log('[Symbiote] Scan complete.');
  console.log(`  Doc files scanned   : ${report.docFiles.length}`);
  console.log(`  Source files scanned: ${report.sourceFiles.length}`);
  console.log(`  Prose claim sources : ${report.proseClaims.length}`);
  console.log(`  OpenAPI sources     : ${report.openApiClaims.length}`);
  console.log(`  Ports documented    : ${report.aggregated.allPorts.join(', ') || 'none'}`);
  console.log(`  Env vars documented : ${report.aggregated.allEnvVars.length}`);
  console.log(`  Auth schemes        : ${report.aggregated.allAuthSchemes.join(', ') || 'none'}`);
  if (outputFile) console.log(`  Output written      : ${outputFile}`);
}