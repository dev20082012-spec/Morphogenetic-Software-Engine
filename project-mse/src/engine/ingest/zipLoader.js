/**
 * ZIP Repository Loader
 *
 * Safely extracts a ZIP file into a RepositorySnapshot.
 * Implements security constraints:
 * - Path traversal rejection (../)
 * - Maximum file count (2000)
 * - Maximum total size (50 MB)
 * - Maximum single file size (5 MB)
 * - Ignored directories (node_modules, .git, dist, build, etc.)
 * - Ignored binary/irrelevant files
 * - Path normalization
 */

import { normalize, isDangerousPath, extname, basename } from '../pathUtils.js';
import { hasBinaryMagicBytes } from '../../utils/securityUtils.js';

/** Hard limits */
const MAX_ZIP_ENTRIES = 5000;
const MAX_FILES = 2000;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Directories to skip entirely */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.cache', '__pycache__', '.tox',
  'vendor', '.idea', '.vscode', '.vs',
  'bower_components', '.parcel-cache',
]);

/** File extensions to include */
const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.txt', '.rst', '.adoc',
  '.py', '.rb', '.go', '.java', '.rs', '.cs',
  '.html', '.css', '.scss', '.less',
  '.sql', '.proto', '.graphql', '.gql',
  '.sh', '.bash', '.zsh', '.fish', '.ps1',
  '.env', '.env.example', '.env.local',
  '.gitignore', '.dockerignore', '.editorconfig',
  '.eslintrc', '.prettierrc',
]);

/** Files with no extension that are still text */
const KNOWN_TEXT_FILES = new Set([
  'Dockerfile', 'Makefile', 'Procfile', 'Gemfile',
  'Rakefile', 'Vagrantfile', 'LICENSE', 'CHANGELOG',
  'README', 'CONTRIBUTING', 'AUTHORS', 'CODEOWNERS',
  '.gitignore', '.dockerignore', '.editorconfig',
  '.env', '.env.example', '.env.local', '.env.test',
]);

/**
 * Load a ZIP file into a RepositorySnapshot.
 *
 * @param {ArrayBuffer} arrayBuffer - Raw ZIP file bytes
 * @param {string} [name] - Optional repository name
 * @returns {Promise<import('../types').RepositorySnapshot>}
 */
export async function loadZipRepository(arrayBuffer, name) {
  // Dynamically import JSZip to allow tree-shaking when not used
  const JSZip = (await import('jszip')).default;

  const zip = await JSZip.loadAsync(arrayBuffer);
  const files = [];
  const skippedFiles = [];
  const warnings = [];
  let totalBytes = 0;

  // 1. Guard against zip bombs with excessive directory entries
  const allEntryPaths = Object.keys(zip.files);
  if (allEntryPaths.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP archive exceeds maximum entry limit (${MAX_ZIP_ENTRIES} entries). Potential decompression bomb rejected.`);
  }

  // Detect common root directory prefix (many ZIPs have one)
  const rootPrefix = detectRootPrefix(allEntryPaths);

  for (const [rawPath, entry] of Object.entries(zip.files)) {
    // Skip directory entries
    if (entry.dir) continue;

    // SECURITY: Reject dangerous paths before any string manipulation or normalization
    if (isDangerousPath(rawPath)) {
      skippedFiles.push({ path: rawPath, reason: 'DANGEROUS_PATH_TRAVERSAL' });
      continue;
    }

    // Strip root prefix if present
    let cleanPath = rawPath;
    if (rootPrefix && cleanPath.startsWith(rootPrefix)) {
      cleanPath = cleanPath.slice(rootPrefix.length);
    }

    // SECURITY: Reject if clean path is dangerous
    if (isDangerousPath(cleanPath)) {
      skippedFiles.push({ path: cleanPath, reason: 'DANGEROUS_PATH_TRAVERSAL' });
      continue;
    }

    // Normalize the path
    cleanPath = normalize(cleanPath);

    // Reject empty paths
    if (!cleanPath) continue;

    // Skip ignored directories
    if (isInIgnoredDir(cleanPath)) continue;

    // Skip non-text extensions
    if (!isTextFile(cleanPath)) {
      skippedFiles.push({ path: cleanPath, reason: 'UNSUPPORTED_BINARY_EXTENSION' });
      continue;
    }

    // Enforce file count limit
    if (files.length >= MAX_FILES) {
      warnings.push(`File count limit reached (${MAX_FILES} files). Ingestion capped.`);
      break;
    }

    // Read and validate file content
    let content;
    try {
      const rawContent = await entry.async('uint8array');

      // Enforce single-file size limit
      if (rawContent.byteLength > MAX_SINGLE_FILE_BYTES) {
        skippedFiles.push({
          path: cleanPath,
          reason: 'OVERSIZED_SINGLE_FILE',
          sizeBytes: rawContent.byteLength,
        });
        continue;
      }

      // Enforce total size limit
      totalBytes += rawContent.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        warnings.push(`Repository total size limit reached (${MAX_TOTAL_BYTES / 1024 / 1024} MB). Ingestion capped.`);
        break;
      }

      // Check for executable or image magic bytes
      if (hasBinaryMagicBytes(rawContent)) {
        skippedFiles.push({ path: cleanPath, reason: 'BINARY_MAGIC_BYTES_DETECTED' });
        continue;
      }

      // Decode as UTF-8, reject if null bytes exist
      content = new TextDecoder('utf-8', { fatal: false }).decode(rawContent);
      if (content.includes('\0')) {
        skippedFiles.push({ path: cleanPath, reason: 'NULL_BYTE_BINARY_DETECTED' });
        continue;
      }
    } catch (err) {
      skippedFiles.push({ path: cleanPath, reason: `UNREADABLE_FILE: ${err.message}` });
      continue;
    }

    files.push({
      path: cleanPath,
      content,
      language: detectLanguage(cleanPath),
    });
  }

  return {
    files,
    metadata: {
      source: 'zip',
      name: name || 'uploaded-repository',
      loadedAt: new Date().toISOString(),
      fileCount: files.length,
      totalBytes,
      skippedFiles,
      warnings,
    },
  };
}

/**
 * Detect if many ZIP entries share a common root directory prefix.
 * e.g., "my-project-main/src/index.js" → "my-project-main/"
 */
function detectRootPrefix(paths) {
  const nonDirPaths = paths.filter(p => !p.endsWith('/'));
  if (nonDirPaths.length === 0) return '';

  const firstParts = nonDirPaths[0].split('/');
  if (firstParts.length < 2) return '';

  const candidate = firstParts[0] + '/';

  // Do not strip standard source directories as if they were archive container prefixes
  const STANDARD_SOURCE_DIRS = new Set([
    'src/', 'lib/', 'app/', 'test/', 'tests/', 'spec/', 'specs/', 'packages/', 'core/', 'api/'
  ]);
  if (STANDARD_SOURCE_DIRS.has(candidate.toLowerCase())) return '';

  const allMatch = nonDirPaths.every(p => p.startsWith(candidate));
  return allMatch ? candidate : '';
}

function isInIgnoredDir(filePath) {
  const parts = filePath.split('/');
  return parts.some(part => IGNORED_DIRS.has(part));
}

function isTextFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const base = basename(filePath);

  // Files with known text extensions
  if (ext && TEXT_EXTENSIONS.has(ext)) return true;

  // Known text files without extensions
  if (KNOWN_TEXT_FILES.has(base)) return true;

  // Dotfiles that are typically text config
  if (base.startsWith('.') && !ext) return true;

  // Files with no extension — check against known names
  if (!ext && KNOWN_TEXT_FILES.has(base)) return true;

  return false;
}

function detectLanguage(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', py: 'python', rb: 'ruby',
    go: 'go', rs: 'rust', java: 'java', cs: 'csharp',
    html: 'html', css: 'css', sql: 'sql',
    proto: 'protobuf', toml: 'toml', xml: 'xml',
  };
  return map[ext] || 'plaintext';
}
