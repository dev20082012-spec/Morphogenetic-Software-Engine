/**
 * Patch Synthesis Engine
 *
 * Generates candidate patches for deterministic violation patterns.
 * Patches are produced from actual loaded file content and include
 * unified diff output.
 *
 * Supported repair strategies:
 * - AUTH_GUARD_INSERTION: Add auth middleware to unguarded routes
 * - TRANSACTION_WRAP: Wrap transaction in try/catch/finally
 * - WEBHOOK_SIGNATURE_GUARD: Add HMAC signature verification
 * - DOC_PORT_RECONCILIATION: Update documentation port to match code
 */

import { basename } from '../pathUtils.js';

/**
 * Synthesize patches for violated invariants.
 *
 * @param {import('../invariants/index.js').InvariantResult} invariantResult
 * @param {import('../repositoryGraph/index.js').AnalysisResult} analysis
 * @param {import('../types').RepositorySnapshot} snapshot
 * @returns {PatchSynthesisResult}
 */
export function synthesizePatches(invariantResult, analysis, snapshot) {
  const startTime = performance.now();
  const patches = [];
  let counter = 0;

  for (const invariant of invariantResult.invariants) {
    if (invariant.status !== 'violated') continue;

    const synthesizer = SYNTHESIZERS[invariant.id];
    if (!synthesizer) continue;

    const results = synthesizer(invariant, analysis, snapshot);
    for (const patch of results) {
      counter++;
      patch.id = `PATCH-${String(counter).padStart(3, '0')}`;
      patches.push(patch);
    }
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    patches,
    summary: {
      generated: patches.length,
      violatedInvariants: invariantResult.summary.violated,
      durationMs,
    },
  };
}

const SYNTHESIZERS = {
  'INV-001': synthesizeRouteAuthPatch,
  'INV-002': synthesizePortPatch,
  'INV-003': synthesizeTransactionPatch,
  'INV-004': synthesizeWebhookSignaturePatch,
};

// ----- Strategy: AUTH_GUARD_INSERTION -----

function synthesizeRouteAuthPatch(invariant, analysis, snapshot) {
  const patches = [];
  const unguardedRoutes = analysis.routes.filter(r =>
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(r.method) && !r.hasAuth
  );

  // Group by file
  const byFile = new Map();
  for (const route of unguardedRoutes) {
    if (!byFile.has(route.file)) byFile.set(route.file, []);
    byFile.get(route.file).push(route);
  }

  for (const [filePath, routes] of byFile) {
    const file = snapshot.files.find(f => f.path === filePath);
    if (!file) continue;

    const lines = file.content.split('\n');

    // Check if requireAuth is already imported
    const hasAuthImport = file.content.includes('requireAuth');

    // Build the patched content
    let patchedLines = [...lines];
    let insertedLines = 0;

    // Find auth module path
    const authFile = analysis.files.find(f =>
      f.exports.some(e => e.name === 'requireAuth')
    );
    const authImportPath = authFile
      ? getRelativeImport(filePath, authFile.path)
      : '../controllers/usersController.js';

    // Add import if needed
    if (!hasAuthImport && authFile) {
      // Find last import line
      let lastImportLine = 0;
      for (let i = 0; i < patchedLines.length; i++) {
        if (/^import\s/.test(patchedLines[i]) || /^const\s.*=\s*require/.test(patchedLines[i])) {
          lastImportLine = i;
        }
      }
      const importStatement = `import { requireAuth } from '${authImportPath}';`;
      patchedLines.splice(lastImportLine + 1, 0, importStatement);
      insertedLines++;
    }

    // Patch each route to include requireAuth
    for (const route of routes) {
      const adjustedLine = route.line - 1 + insertedLines;
      const originalLine = patchedLines[adjustedLine];
      if (!originalLine) continue;

      // Insert requireAuth before the handler
      // Pattern: routerName.method('path', handler) → routerName.method('path', requireAuth, handler)
      const patched = originalLine.replace(
        /(\.\s*(?:get|post|put|patch|delete)\s*\(\s*['"`][^'"`]*['"`])\s*,/i,
        '$1, requireAuth,'
      );

      if (patched !== originalLine) {
        patchedLines[adjustedLine] = patched;
      }
    }

    const patchedContent = patchedLines.join('\n');
    const diff = generateUnifiedDiff(filePath, file.content, patchedContent);

    patches.push({
      id: '', // filled by caller
      findingId: invariant.linkedFindingIds[0] || '',
      targetFile: filePath,
      strategy: 'AUTH_GUARD_INSERTION',
      description: `Insert requireAuth middleware into ${routes.length} unguarded route(s) in ${basename(filePath)}.`,
      diff,
      patchedContent,
      filesChanged: [filePath],
      confidence: 'high',
    });
  }

  return patches;
}

// ----- Strategy: DOC_PORT_RECONCILIATION -----

function synthesizePortPatch(invariant, analysis, snapshot) {
  const patches = [];

  // Find the code's default port
  const portVar = analysis.environmentVariables.find(v => v.name === 'PORT');
  if (!portVar || !portVar.defaultValue) return patches;

  const codePort = portVar.defaultValue;

  // Patch README files
  for (const ev of invariant.evidence) {
    if (!ev.file) continue;
    const file = snapshot.files.find(f => f.path === ev.file);
    if (!file) continue;

    if (file.language === 'markdown' || file.path.endsWith('.md')) {
      const lines = file.content.split('\n');
      let modified = false;
      const patchedLines = lines.map(line => {
        // Skip database ports
        if (/postgres|mysql|redis|mongo|database/i.test(line)) return line;

        // Replace port references (Port: 3000, PORT=3000, localhost:3000)
        const portMatch = line.match(/(?:port[:\s=]+|localhost:)(\d{2,5})/i);
        if (portMatch && portMatch[1] !== codePort) {
          modified = true;
          return line.replace(portMatch[1], codePort);
        }
        return line;
      });

      if (modified) {
        const patchedContent = patchedLines.join('\n');
        const diff = generateUnifiedDiff(file.path, file.content, patchedContent);
        patches.push({
          id: '',
          findingId: invariant.linkedFindingIds[0] || '',
          targetFile: file.path,
          strategy: 'DOC_PORT_RECONCILIATION',
          description: `Update port reference in ${basename(file.path)} from documented value to ${codePort} to match code.`,
          diff,
          patchedContent,
          filesChanged: [file.path],
          confidence: 'high',
        });
      }
    }

    // Patch .env.example files
    if (file.path.includes('.env')) {
      const lines = file.content.split('\n');
      let modified = false;
      const patchedLines = lines.map(line => {
        const match = line.match(/^(PORT\s*=\s*)(\d+)/);
        if (match && match[2] !== codePort) {
          modified = true;
          return `${match[1]}${codePort}`;
        }
        return line;
      });

      if (modified) {
        const patchedContent = patchedLines.join('\n');
        const diff = generateUnifiedDiff(file.path, file.content, patchedContent);
        patches.push({
          id: '',
          findingId: invariant.linkedFindingIds[0] || '',
          targetFile: file.path,
          strategy: 'DOC_PORT_RECONCILIATION',
          description: `Update PORT value in ${basename(file.path)} from documented value to ${codePort} to match code default.`,
          diff,
          patchedContent,
          filesChanged: [file.path],
          confidence: 'high',
        });
      }
    }
  }

  return patches;
}

// ----- Strategy: TRANSACTION_WRAP -----

function synthesizeTransactionPatch(invariant, analysis, snapshot) {
  const patches = [];

  for (const fileAnalysis of analysis.files) {
    const { begins, rollbacks } = fileAnalysis.transactionSites;
    if (begins.length === 0 || rollbacks.length > 0) continue;

    const file = snapshot.files.find(f => f.path === fileAnalysis.path);
    if (!file) continue;

    const lines = file.content.split('\n');
    const patchedLines = [...lines];
    let offset = 0;

    for (const begin of begins) {
      const lineIdx = begin.line - 1 + offset;
      const originalLine = patchedLines[lineIdx];
      if (!originalLine) continue;

      const indent = originalLine.match(/^(\s*)/)[1];

      // Find the closing brace of the function containing this line
      // Simple heuristic: look for the next method definition or closing brace at same indent
      let endIdx = lineIdx + 1;
      while (endIdx < patchedLines.length) {
        const endLine = patchedLines[endIdx];
        if (endLine.trim() === '}' || endLine.trim() === '};' || endLine.trim() === '},') {
          break;
        }
        endIdx++;
      }

      // Insert try/catch wrap
      const wrapBefore = [
        `${indent}const txn = await this.query('BEGIN');`,
        `${indent}try {`,
      ];
      const wrapAfter = [
        `${indent}  await this.query('COMMIT');`,
        `${indent}} catch (err) {`,
        `${indent}  await this.query('ROLLBACK');`,
        `${indent}  throw err;`,
        `${indent}}`,
      ];

      // Replace the beginTransaction line
      patchedLines.splice(lineIdx, 1, ...wrapBefore);
      offset += wrapBefore.length - 1;

      // Insert commit/rollback before the closing brace
      const adjustedEnd = endIdx + offset;
      patchedLines.splice(adjustedEnd, 0, ...wrapAfter);
      offset += wrapAfter.length;
    }

    const patchedContent = patchedLines.join('\n');
    const diff = generateUnifiedDiff(file.path, file.content, patchedContent);

    patches.push({
      id: '',
      findingId: invariant.linkedFindingIds[0] || '',
      targetFile: file.path,
      strategy: 'TRANSACTION_WRAP',
      description: `Wrap database transaction in ${basename(file.path)} with try/catch/finally to guarantee COMMIT on success and ROLLBACK on failure.`,
      diff,
      patchedContent,
      filesChanged: [file.path],
      confidence: 'medium',
    });
  }

  return patches;
}

// ----- Strategy: WEBHOOK_SIGNATURE_GUARD -----

function synthesizeWebhookSignaturePatch(invariant, analysis, snapshot) {
  const patches = [];

  const webhookRoutes = analysis.routes.filter(r =>
    r.method !== 'USE' && /webhook|hook|github|stripe/i.test(r.path) && !r.hasAuth
  );

  // Find the signature verification helper
  const verifyHelper = analysis.files.find(f =>
    f.exports.some(e => /verify.*signature/i.test(e.name))
  );

  for (const route of webhookRoutes) {
    const file = snapshot.files.find(f => f.path === route.file);
    if (!file) continue;

    const lines = file.content.split('\n');
    const patchedLines = [...lines];
    let offset = 0;

    // Add import for verification helper if available
    if (verifyHelper) {
      const verifyExport = verifyHelper.exports.find(e => /verify.*signature/i.test(e.name));
      const importPath = getRelativeImport(route.file, verifyHelper.path);
      const importLine = `import { ${verifyExport.name} } from '${importPath}';`;

      // Find last import line
      let lastImportLine = 0;
      for (let i = 0; i < patchedLines.length; i++) {
        if (/^import\s/.test(patchedLines[i])) lastImportLine = i;
      }

      // Check if import already exists
      if (!file.content.includes(verifyExport.name)) {
        patchedLines.splice(lastImportLine + 1, 0, importLine);
        offset++;
      }
    }

    // Insert signature check at the start of the route handler
    const routeLineIdx = route.line - 1 + offset;
    // Find the opening brace of the handler function
    let handlerStart = routeLineIdx;
    for (let i = routeLineIdx; i < Math.min(routeLineIdx + 5, patchedLines.length); i++) {
      if (patchedLines[i].includes('{')) {
        handlerStart = i;
        break;
      }
    }

    const indent = '  ';
    const guardLines = [
      `${indent}// MSE Patch: Webhook signature verification guard`,
      `${indent}const sig = req.headers['x-hub-signature-256'];`,
      `${indent}const secret = process.env.WEBHOOK_SECRET;`,
      `${indent}if (!sig || !secret || !verifyWebhookSignature(JSON.stringify(req.body), sig, secret)) {`,
      `${indent}  return res.status(401).json({ error: 'Invalid or missing HMAC signature' });`,
      `${indent}}`,
    ];

    patchedLines.splice(handlerStart + 1, 0, ...guardLines);

    const patchedContent = patchedLines.join('\n');
    const diff = generateUnifiedDiff(file.path, file.content, patchedContent);

    patches.push({
      id: '',
      findingId: invariant.linkedFindingIds[0] || '',
      targetFile: file.path,
      strategy: 'WEBHOOK_SIGNATURE_GUARD',
      description: `Insert HMAC-SHA256 signature verification guard in ${basename(file.path)} before webhook payload processing.`,
      diff,
      patchedContent,
      filesChanged: verifyHelper && !file.content.includes('verifyWebhookSignature')
        ? [file.path]
        : [file.path],
      confidence: 'high',
    });
  }

  return patches;
}

// ----- Diff Generation -----

/**
 * Generate a unified diff between two file contents.
 *
 * @param {string} filePath
 * @param {string} original
 * @param {string} modified
 * @returns {string}
 */
function generateUnifiedDiff(filePath, original, modified) {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const chunks = [];

  let i = 0;
  let j = 0;

  while (i < origLines.length || j < modLines.length) {
    // Find next difference
    if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
      i++;
      j++;
      continue;
    }

    // Found a difference - collect context
    const contextStart = Math.max(0, i - 3);
    const chunkLines = [];

    // Leading context
    for (let c = contextStart; c < i; c++) {
      chunkLines.push({ type: 'context', text: origLines[c], oldNum: c + 1, newNum: c + 1 + (j - i) });
    }

    // Collect diff region
    const diffStartOld = i;
    const diffStartNew = j;

    // Find where files resync (simple LCS-like approach)
    let syncFound = false;
    let removedLines = [];
    let addedLines = [];

    // Look ahead to find sync point
    for (let lookAhead = 0; lookAhead < 20 && !syncFound; lookAhead++) {
      // Check if current modified line matches ahead in original
      if (j + lookAhead < modLines.length) {
        const modLine = modLines[j + lookAhead];
        const origIdx = origLines.indexOf(modLine, i);
        if (origIdx >= i && origIdx < i + 20) {
          // Found sync - everything between is the diff
          for (let r = i; r < origIdx; r++) {
            removedLines.push(origLines[r]);
          }
          for (let a = j; a < j + lookAhead; a++) {
            addedLines.push(modLines[a]);
          }
          i = origIdx;
          j = j + lookAhead;
          syncFound = true;
        }
      }
    }

    if (!syncFound) {
      // Can't find sync - treat as replacement
      if (i < origLines.length) {
        removedLines.push(origLines[i]);
        i++;
      }
      if (j < modLines.length) {
        addedLines.push(modLines[j]);
        j++;
      }
    }

    for (const line of removedLines) {
      chunkLines.push({ type: 'remove', text: line });
    }
    for (const line of addedLines) {
      chunkLines.push({ type: 'add', text: line });
    }

    // Trailing context
    for (let c = 0; c < 3 && i + c < origLines.length && j + c < modLines.length; c++) {
      if (origLines[i + c] === modLines[j + c]) {
        chunkLines.push({ type: 'context', text: origLines[i + c] });
      }
    }

    if (chunkLines.length > 0) {
      const removeCount = removedLines.length;
      const addCount = addedLines.length;
      chunks.push({
        header: `@@ -${diffStartOld + 1},${removeCount + 6} +${diffStartNew + 1},${addCount + 6} @@`,
        lines: chunkLines,
      });
    }
  }

  // Format as unified diff string
  let diff = `--- a/${filePath}\n+++ b/${filePath}\n`;
  for (const chunk of chunks) {
    diff += chunk.header + '\n';
    for (const line of chunk.lines) {
      if (line.type === 'remove') diff += `- ${line.text}\n`;
      else if (line.type === 'add') diff += `+ ${line.text}\n`;
      else diff += `  ${line.text}\n`;
    }
  }

  return diff;
}

// ----- Helpers -----

function getRelativeImport(fromFile, toFile) {
  const fromParts = fromFile.split('/');
  const toParts = toFile.split('/');

  fromParts.pop(); // Remove filename

  // Find common prefix length
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++;
  }

  const ups = fromParts.length - common;
  const remaining = toParts.slice(common);

  const prefix = ups === 0 ? './' : '../'.repeat(ups);
  return prefix + remaining.join('/');
}

/**
 * @typedef {{
 *   patches: (import('../types').Patch & { patchedContent: string })[],
 *   summary: {
 *     generated: number,
 *     violatedInvariants: number,
 *     durationMs: number,
 *   },
 * }} PatchSynthesisResult
 */
