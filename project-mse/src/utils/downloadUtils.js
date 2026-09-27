import { sanitizeDownloadFilename } from './securityUtils.js';

const SAFE_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'text/x-diff',
  'text/csv',
]);

/**
 * Triggers a browser download of text content as a file with strict security controls:
 * - Sanitizes filenames to eliminate path traversal, control chars, and unsafe symbols
 * - Enforces safe non-executable MIME types (prevents text/html or application/javascript)
 * - Releases memory object URLs
 *
 * @param {string} filename - Name of the file to save
 * @param {string} content - Text content of the file
 * @param {string} [mimeType='text/plain'] - MIME type
 */
export function downloadFile(filename, content, mimeType = 'text/plain') {
  if (typeof window === 'undefined') return;

  const safeFilename = sanitizeDownloadFilename(filename);
  const safeMime = SAFE_MIME_TYPES.has(mimeType) ? mimeType : 'text/plain';

  const blob = new Blob([String(content ?? '')], { type: `${safeMime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFilename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Download a consolidated patch file from synthesized patches.
 *
 * @param {Array<{ id: string, diff: string, description: string, targetFile: string }>} patches
 * @param {string} [repoName='project']
 */
export function downloadPatches(patches, repoName = 'repository') {
  if (!patches || patches.length === 0) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const header = `# MSE Synthesized Patchset for ${repoName}\n# Generated: ${new Date().toISOString()}\n# Patches included: ${patches.length}\n\n`;
  const body = patches.map(p => `# Patch ${p.id}: ${p.description}\n# Target: ${p.targetFile}\n${p.diff}`).join('\n\n');

  downloadFile(`mse-patches-${repoName}-${timestamp}.patch`, header + body, 'text/x-diff');
}

/**
 * Download JSON audit report.
 *
 * @param {object} reportJson
 * @param {string} [repoName='project']
 */
export function downloadJsonReport(reportJson, repoName = 'repository') {
  if (!reportJson) return;
  const content = JSON.stringify(reportJson, null, 2);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadFile(`mse-report-${repoName}-${timestamp}.json`, content, 'application/json');
}

/**
 * Download Markdown audit report.
 *
 * @param {string} reportMarkdown
 * @param {string} [repoName='project']
 */
export function downloadMarkdownReport(reportMarkdown, repoName = 'repository') {
  if (!reportMarkdown) return;
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadFile(`mse-report-${repoName}-${timestamp}.md`, reportMarkdown, 'text/markdown');
}
