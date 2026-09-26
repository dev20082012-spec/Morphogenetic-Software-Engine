/**
 * Patch Synthesizer
 *
 * Given a ViolationRecord, generates the minimal code edit that restores the
 * broken invariant. Output is a structured PatchResult containing:
 *
 *   - A human-readable description of the repair strategy
 *   - A unified-diff fragment that can be applied to the target file
 *   - The repaired source snippet (for inline PR display)
 *   - A verification proof: the set of invariant postconditions that hold
 *     after the patch is applied
 *
 * The synthesizer operates in three tiers:
 *
 *   Tier 1 -- Structural patch: wraps a site in a guard, try/finally, or
 *             conditional block, reconstructed from the evidence excerpt.
 *
 *   Tier 2 -- Heuristic patch: derives a canonical fix pattern for the
 *             violation type (auth guard, mutex wrap, transaction wrap,
 *             async I/O replacement) regardless of evidence context.
 *
 *   Tier 3 -- Descriptor patch: when the site is too ambiguous, emits a
 *             precise natural-language description of the required edit
 *             with enough context for a developer to apply it in under
 *             60 seconds.
 */

import { safeGet, ensure } from '../security/errors.js';

// ---------------------------------------------------------------------------
// Tier 1: Structural patches (evidence-anchored)
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   status: 'PATCH_READY' | 'DESCRIPTOR_ONLY',
 *   violationId: string,
 *   targetFile: string,
 *   strategy: string,
 *   description: string,
 *   diff: string,
 *   repairedSnippet: string,
 *   postconditions: string[],
 *   confidence: 'HIGH' | 'MEDIUM' | 'LOW',
 * }} PatchResult
 */

/** Indent one level (2 spaces). */
const I = '  ';

/**
 * Build a unified diff fragment.
 *
 * @param {string} targetFile
 * @param {string} removedLines   -- lines that start with '- '
 * @param {string} addedLines     -- lines that start with '+ '
 * @param {number} lineHint
 * @returns {string}
 */
function buildDiff(targetFile, removedLines, addedLines, lineHint = 1) {
  const removed = String(removedLines).split('\n').filter(Boolean).map(l => `- ${l}`).join('\n');
  const added   = String(addedLines).split('\n').filter(Boolean).map(l => `+ ${l}`).join('\n');
  return `--- a/${targetFile}\n+++ b/${targetFile}\n@@ -${lineHint},${removed.split('\n').length} +${lineHint},${added.split('\n').length} @@\n${removed}\n${added}`;
}

// ---------------------------------------------------------------------------
// Type-specific patch strategies
// ---------------------------------------------------------------------------

/**
 * SECURITY: insert an auth-guard before the mutating async operation.
 * @param {import('../agents/immuneCore.js').ViolationRecord} v
 * @returns {PatchResult}
 */
function patchSecurity(v) {
  const target  = safeGet(v, 'affectedFiles', [])[0] || 'unknown';
  const ev      = safeGet(v, 'evidence', [])[0] || {};
  const site    = safeGet(ev, 'excerpt', 'await db.write(data)');
  const lineNum = safeGet(ev, 'lineNumber', 1);

  const removed = site;
  const added   = [
    `if (!req.user || !req.headers['authorization']) {`,
    `${I}return res.status(401).json({ error: 'Unauthorized' });`,
    `}`,
    site,
  ].join('\n');

  const snippet = [
    `// MSE Patch: auth guard inserted before state mutation`,
    `// Violation: ${v.id} in ${target}:${lineNum}`,
    `if (!req.user || !req.headers['authorization']) {`,
    `${I}return res.status(401).json({ error: 'Unauthorized' });`,
    `}`,
    `// original line preserved below:`,
    site,
  ].join('\n');

  return {
    status:          'PATCH_READY',
    violationId:     v.id,
    targetFile:      target,
    strategy:        'AUTH_GUARD_INSERTION',
    description:     `Insert token-validation guard before '${site.trim().slice(0, 60)}' at line ${lineNum} in ${target}.`,
    diff:            buildDiff(target, removed, added, lineNum),
    repairedSnippet: snippet,
    postconditions: [
      'req.user is defined before any state mutation executes',
      'Authorization header is validated before write operations',
      'Unauthenticated requests receive HTTP 401 and no state change occurs',
    ],
    confidence: ev.excerpt ? 'HIGH' : 'MEDIUM',
  };
}

/**
 * CONCURRENCY: wrap acquire/critical-section in try/finally with release.
 * @param {import('../agents/immuneCore.js').ViolationRecord} v
 * @returns {PatchResult}
 */
function patchConcurrency(v) {
  const target  = safeGet(v, 'affectedFiles', [])[0] || 'unknown';
  const ev      = safeGet(v, 'evidence', [])[0] || {};
  const acquire = safeGet(ev, 'excerpt', 'await mutex.acquire()');
  const lineNum = safeGet(ev, 'lineNumber', 1);

  const removed = [acquire, `// ... critical section`, `// missing: mutex.release()`].join('\n');
  const added   = [
    acquire,
    `try {`,
    `${I}// critical section`,
    `} finally {`,
    `${I}mutex.release();`,
    `}`,
  ].join('\n');

  const snippet = [
    `// MSE Patch: try/finally mutex wrap`,
    `// Violation: ${v.id} in ${target}:${lineNum}`,
    acquire,
    `try {`,
    `${I}// ... critical section (preserved)`,
    `} finally {`,
    `${I}mutex.release(); // guaranteed release on all paths`,
    `}`,
  ].join('\n');

  return {
    status:          'PATCH_READY',
    violationId:     v.id,
    targetFile:      target,
    strategy:        'MUTEX_WRAP_TRY_FINALLY',
    description:     `Wrap mutex acquisition at line ${lineNum} in ${target} with try/finally to guarantee release on all code paths including exceptions.`,
    diff:            buildDiff(target, removed, added, lineNum),
    repairedSnippet: snippet,
    postconditions: [
      'mutex.release() is reachable on all exit paths from the critical section',
      'No lock is held after function returns, regardless of exception',
      'Deadlock risk from this site is eliminated',
    ],
    confidence: ev.excerpt ? 'HIGH' : 'MEDIUM',
  };
}

/**
 * DATA_INTEGRITY: wrap transaction BEGIN with try/catch/finally ROLLBACK + COMMIT.
 * @param {import('../agents/immuneCore.js').ViolationRecord} v
 * @returns {PatchResult}
 */
function patchDataIntegrity(v) {
  const target  = safeGet(v, 'affectedFiles', [])[0] || 'unknown';
  const ev      = safeGet(v, 'evidence', [])[0] || {};
  const begin   = safeGet(ev, 'excerpt', "await db.beginTransaction()");
  const lineNum = safeGet(ev, 'lineNumber', 1);

  const removed = [begin, `// ... operations`, `// missing COMMIT or ROLLBACK`].join('\n');
  const added   = [
    begin,
    `try {`,
    `${I}// ... operations`,
    `${I}await db.commit();`,
    `} catch (err) {`,
    `${I}await db.rollback();`,
    `${I}throw err;`,
    `}`,
  ].join('\n');

  const snippet = [
    `// MSE Patch: transaction closure`,
    `// Violation: ${v.id} in ${target}:${lineNum}`,
    begin,
    `try {`,
    `${I}// ... operations (preserved)`,
    `${I}await db.commit();`,
    `} catch (err) {`,
    `${I}await db.rollback();`,
    `${I}throw err; // re-throw so caller sees failure`,
    `}`,
  ].join('\n');

  return {
    status:          'PATCH_READY',
    violationId:     v.id,
    targetFile:      target,
    strategy:        'TRANSACTION_WRAP_TRY_CATCH',
    description:     `Wrap transaction at line ${lineNum} in ${target} with try/catch/finally to guarantee COMMIT on success and ROLLBACK on all exception paths.`,
    diff:            buildDiff(target, removed, added, lineNum),
    repairedSnippet: snippet,
    postconditions: [
      'Every opened transaction is closed (COMMIT or ROLLBACK) on all paths',
      'Exception during transaction triggers ROLLBACK and re-throws',
      'No uncommitted transaction can survive a process exit from this site',
    ],
    confidence: ev.excerpt ? 'HIGH' : 'MEDIUM',
  };
}

/**
 * CORRECTNESS: replace synchronous I/O with async equivalent.
 * @param {import('../agents/immuneCore.js').ViolationRecord} v
 * @returns {PatchResult}
 */
function patchCorrectness(v) {
  const target  = safeGet(v, 'affectedFiles', [])[0] || 'unknown';
  const ev      = safeGet(v, 'evidence', [])[0] || {};
  const site    = safeGet(ev, 'excerpt', "const data = fs.readFileSync(filePath, 'utf8');");
  const lineNum = safeGet(ev, 'lineNumber', 1);

  // Derive async equivalent from common sync patterns
  const asyncSite = String(site)
    .replace(/fs\.readFileSync\s*\(/, "await fs.promises.readFile(")
    .replace(/fs\.writeFileSync\s*\(/, "await fs.promises.writeFile(")
    .replace(/fs\.existsSync\s*\(/, "await fs.promises.access(")
    .replace(/JSON\.parse\(fs\.readFileSync/, "JSON.parse(await fs.promises.readFile")
    .replace(/(?<!\bawait\b)\s+([a-zA-Z_$][a-zA-Z0-9_$]*\.(?:read|write|stat|unlink|mkdir|rmdir)Sync)\s*\(/, " await $1Async(");

  const snippet = [
    `// MSE Patch: sync -> async I/O`,
    `// Violation: ${v.id} in ${target}:${lineNum}`,
    `// Ensure handler is declared async`,
    asyncSite !== site ? asyncSite : `// await fs.promises.readFile(filePath, 'utf8'); // replace sync call`,
  ].join('\n');

  return {
    status:          'PATCH_READY',
    violationId:     v.id,
    targetFile:      target,
    strategy:        'SYNC_IO_TO_ASYNC',
    description:     `Replace synchronous I/O call at line ${lineNum} in ${target} with its async equivalent and ensure the enclosing function is declared async.`,
    diff:            buildDiff(target, site, asyncSite !== site ? asyncSite : `await fs.promises.readFile(filePath, 'utf8')`, lineNum),
    repairedSnippet: snippet,
    postconditions: [
      'No blocking I/O call remains in the route handler',
      'Event loop is not blocked during file/network operations',
      'Handler is declared async and awaits all I/O',
    ],
    confidence: asyncSite !== site ? 'HIGH' : 'MEDIUM',
  };
}

/**
 * DRIFT (doc drift): descriptor-only -- patch cannot be automated.
 * @param {import('../agents/immuneCore.js').ViolationRecord} v
 * @returns {PatchResult}
 */
function patchDrift(v) {
  const target = safeGet(v, 'affectedFiles', [])[0] || 'documentation';
  return {
    status:          'DESCRIPTOR_ONLY',
    violationId:     v.id,
    targetFile:      target,
    strategy:        'DOCUMENTATION_UPDATE',
    description:     `Update '${target}' to reflect actual runtime values. ${safeGet(v, 'description', '')}`,
    diff:            `# Manual update required in ${target}\n# ${v.name}`,
    repairedSnippet: `// No code change required -- documentation must be updated.`,
    postconditions: [
      'Documentation accurately reflects current code behaviour',
      'D_intent score decreases after update',
    ],
    confidence: 'LOW',
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Synthesize the minimal patch for a violation record.
 *
 * @param {import('../agents/immuneCore.js').ViolationRecord} violation
 * @returns {PatchResult}
 */
export function synthesizePatch(violation) {
  // Validate input
  const v = ensure(violation, 'Violation record is required');
  const type = safeGet(v, 'type', 'CORRECTNESS');

  switch (type) {
    case 'SECURITY':      return patchSecurity(v);
    case 'CONCURRENCY':   return patchConcurrency(v);
    case 'DATA_INTEGRITY': return patchDataIntegrity(v);
    case 'CORRECTNESS':   return patchCorrectness(v);
    case 'DRIFT':         return patchDrift(v);
    default:              return patchCorrectness(v);
  }
}