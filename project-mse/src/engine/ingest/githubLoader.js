/**
 * GitHub Public Repository Ingestion Loader
 *
 * Fetches public repository trees and file contents via GitHub REST APIs,
 * filtering out binaries, oversized assets, and dependencies, and returning
 * a standard in-memory RepositorySnapshot ready for the existing MSE pipeline.
 */

import { normalizePath } from '../pathUtils.js';

const SUPPORTED_TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.md', '.markdown', '.txt', '.env', '.example',
  '.yml', '.yaml', '.toml'
]);

const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', '.github', 'dist', 'build', 'out',
  'coverage', '.next', '.cache', 'vendor', '__pycache__'
]);

const MAX_FILES = 40;
const MAX_FILE_SIZE = 300 * 1024; // 300 KB per file
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10 MB total uncompressed

/**
 * Validates and extracts owner & repo from GitHub URL.
 *
 * @param {string} url
 * @returns {{ owner: string, repo: string, normalizedUrl: string }}
 */
export function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid GitHub URL: Input must be a valid URL string.');
  }

  const clean = url.trim().replace(/\.git$/i, '');
  const match = clean.match(/^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/.*)?$/);

  if (!match) {
    throw new Error('Invalid GitHub URL format. Expected: https://github.com/owner/repository');
  }

  const owner = match[1];
  const repo = match[2];

  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}`
  };
}

/**
 * Fetches a public GitHub repository and constructs an in-memory RepositorySnapshot.
 *
 * @param {string} rawUrl
 * @param {{ fetchFn?: typeof fetch, token?: string }} [options]
 * @returns {Promise<import('../types').RepositorySnapshot>}
 */
export async function loadGitHubRepository(rawUrl, options = {}) {
  const fetchImpl = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchImpl) {
    throw new Error('HTTP fetch is not available in the current runtime environment.');
  }

  const { owner, repo, normalizedUrl } = parseGitHubUrl(rawUrl);

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Project-MSE-Engine/2.0'
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  // 1. Fetch git tree recursively
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  let treeRes;
  try {
    treeRes = await fetchImpl(treeUrl, { headers });
  } catch (err) {
    throw new Error(`Network failure connecting to GitHub API: ${err.message}. Please check connection or use ZIP upload.`);
  }

  if (!treeRes.ok) {
    if (treeRes.status === 404) {
      throw new Error(`Repository "${owner}/${repo}" not found. Verify that the repository is public and the URL is spelled correctly.`);
    }
    if (treeRes.status === 403) {
      throw new Error(`GitHub API rate limit exceeded (HTTP 403). Try again later or use the bundled demo or ZIP upload.`);
    }
    throw new Error(`GitHub API returned error HTTP ${treeRes.status}: ${treeRes.statusText}`);
  }

  const treeData = await treeRes.json();
  const tree = treeData.tree || [];

  if (tree.length === 0) {
    throw new Error(`Repository "${owner}/${repo}" is empty or has no files in default branch.`);
  }

  // 2. Filter supported source files
  const candidateFiles = [];
  for (const item of tree) {
    if (item.type !== 'blob') continue;

    const path = normalizePath(item.path);
    const segments = path.split('/');

    // Skip ignored directories
    if (segments.some(s => IGNORED_DIRECTORIES.has(s.toLowerCase()))) continue;

    // Skip oversized files
    if (item.size && item.size > MAX_FILE_SIZE) continue;

    // Check extension
    const extMatch = path.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0].toLowerCase() : '';
    if (SUPPORTED_TEXT_EXTENSIONS.has(ext) || path.toLowerCase().includes('readme') || path.toLowerCase().includes('license')) {
      candidateFiles.push({
        path,
        size: item.size || 0,
        sha: item.sha
      });
    }

    if (candidateFiles.length >= MAX_FILES) break;
  }

  if (candidateFiles.length === 0) {
    throw new Error(`No supported JavaScript, TypeScript, or documentation files found in "${owner}/${repo}".`);
  }

  // 3. Fetch file contents concurrently with size bounds
  const repositoryFiles = [];
  let totalBytes = 0;

  for (const fileInfo of candidateFiles) {
    if (totalBytes >= MAX_TOTAL_SIZE) break;

    const rawFileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${fileInfo.path}`;
    try {
      const fileRes = await fetchImpl(rawFileUrl);
      if (!fileRes.ok) continue;

      const content = await fileRes.text();
      totalBytes += content.length;

      repositoryFiles.push({
        path: fileInfo.path,
        content
      });
    } catch {
      // Gracefully continue on single file fetch failure
    }
  }

  if (repositoryFiles.length === 0) {
    throw new Error(`Failed to download file contents from "${owner}/${repo}". Please check network access or use ZIP upload.`);
  }

  return {
    files: repositoryFiles,
    metadata: {
      name: `${owner}/${repo}`,
      source: 'github',
      url: normalizedUrl,
      owner,
      repo,
      branch: 'HEAD',
      totalFiles: repositoryFiles.length,
      importedAt: new Date().toISOString()
    }
  };
}
