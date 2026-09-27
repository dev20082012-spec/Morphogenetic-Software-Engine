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
