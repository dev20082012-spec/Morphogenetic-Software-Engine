/**
 * Diff parsing and formatting utilities
 */

/**
 * Parses a unified diff string into structured chunk objects.
 *
 * @param {string} diffString
 * @returns {Array<{ header: string, lines: Array<{ type: 'add'|'remove'|'context', text: string, oldNum: number|null, newNum: number|null }> }>}
 */
export function parseUnifiedDiff(diffString) {
  if (!diffString || typeof diffString !== 'string') return [];

  const rawLines = diffString.split('\n');
  const chunks = [];
  let currentChunk = null;
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const line of rawLines) {
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    if (line.startsWith('@@')) {
      const match = line.match(/@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      currentChunk = { header: line, lines: [] };
      chunks.push(currentChunk);
      continue;
    }

    if (!currentChunk) {
      currentChunk = { header: '@@ -1,1 +1,1 @@', lines: [] };
      chunks.push(currentChunk);
    }

    if (line.startsWith('+')) {
      currentChunk.lines.push({
        type: 'add',
        text: line.slice(1),
        oldNum: null,
        newNum: newLineNum++,
      });
    } else if (line.startsWith('-')) {
      currentChunk.lines.push({
        type: 'remove',
        text: line.slice(1),
        oldNum: oldLineNum++,
        newNum: null,
      });
    } else {
      currentChunk.lines.push({
        type: 'context',
        text: line.startsWith(' ') ? line.slice(1) : line,
        oldNum: oldLineNum++,
        newNum: newLineNum++,
      });
    }
  }

  return chunks;
}

/**
 * Generates a unified diff string between original and modified text content.
 *
 * @param {string} filePath
 * @param {string} original
 * @param {string} modified
 * @returns {string}
 */
export function generateUnifiedDiff(filePath, original, modified) {
  if (original === modified) return '';

  const origLines = (original ?? '').split('\n');
  const modLines = (modified ?? '').split('\n');
  const chunks = [];

  let i = 0;
  let j = 0;

  while (i < origLines.length || j < modLines.length) {
    if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
      i++;
      j++;
      continue;
    }

    const contextStart = Math.max(0, i - 3);
    const chunkLines = [];

    // Leading context
    for (let c = contextStart; c < i; c++) {
      chunkLines.push({ type: 'context', text: origLines[c], oldNum: c + 1, newNum: c + 1 + (j - i) });
    }

    const diffStartOld = i;
    const diffStartNew = j;

    let syncFound = false;
    const removedLines = [];
    const addedLines = [];

    for (let lookAhead = 0; lookAhead < 30 && !syncFound; lookAhead++) {
      if (j + lookAhead < modLines.length) {
        const modLine = modLines[j + lookAhead];
        const origIdx = origLines.indexOf(modLine, i);
        if (origIdx >= i && origIdx < i + 30) {
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

  if (chunks.length === 0) return '';

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
