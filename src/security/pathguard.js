/**
 * Path Guard -- Centralized Path Traversal Protection
 *
 * All filesystem operations must route through these validators.
 * Prevents directory traversal (../), symlink escapes, and absolute path injection.
 */

import path from 'node:path';
import fs from 'node:fs';

/**
 * Maximum allowed path length (prevents buffer exhaustion).
 */
export const MAX_PATH_LENGTH = 4096;

/**
 * Maximum allowed filename length.
 */
export const MAX_FILENAME_LENGTH = 255;

/**
 * Forbidden byte sequences in paths.
 */
export const FORBIDDEN_PATH_BYTES = ['\0', '\r', '\n'];

/**
 * Validate that a target path stays strictly within a root directory.
 * Throws on any traversal attempt.
 *
 * @param {string} root - Absolute root directory (must be normalized)
 * @param {string} target - Target path to validate
 * @param {boolean} [allowOutside=false] - If true, allows target to be outside root (for output dirs)
 * @returns {string} - Normalized, resolved target path
 * @throws {Error} - If target escapes root or contains forbidden sequences
 */
export function assertWithinRoot(root, target, allowOutside = false) {
  if (typeof root !== 'string' || typeof target !== 'string') {
    throw new TypeError('assertWithinRoot: root and target must be strings');
  }

  if (root.length > MAX_PATH_LENGTH || target.length > MAX_PATH_LENGTH) {
    throw new RangeError('Path exceeds maximum allowed length');
  }

  for (const byte of FORBIDDEN_PATH_BYTES) {
    if (root.includes(byte) || target.includes(byte)) {
      throw new Error('Path contains forbidden null/control bytes');
    }
  }

  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);

  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!allowOutside && (relative.startsWith('..') || path.isAbsolute(relative))) {
    throw new Error(`Path traversal blocked: '${target}' escapes root '${root}'`);
  }

  // Additional symlink check (best-effort, may throw if target doesn't exist yet)
  try {
    const targetStat = fs.lstatSync(resolvedTarget);
    if (targetStat.isSymbolicLink()) {
      const realTarget = fs.realpathSync(resolvedTarget);
      const realRelative = path.relative(resolvedRoot, realTarget);
      if (!allowOutside && (realRelative.startsWith('..') || path.isAbsolute(realRelative))) {
        throw new Error(`Symlink traversal blocked: '${target}' resolves outside root`);
      }
    }
  } catch (e) {
    // If target doesn't exist yet, that's OK for write operations
    if (e.code !== 'ENOENT') throw e;
  }

  return resolvedTarget;
}

/**
 * Non-throwing variant for filtering operations.
 * Returns null if the path is invalid or escapes root.
 *
 * @param {string} root
 * @param {string} target
 * @returns {string|null} - Resolved target path or null if invalid
 */
export function tryWithinRoot(root, target) {
  try {
    return assertWithinRoot(root, target);
  } catch {
    return null;
  }
}

/**
 * Validate a filename (not a full path) for safety.
 * Rejects path separators, null bytes, control chars, and reserved names.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSafeFilename(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_FILENAME_LENGTH) {
    return false;
  }

  // Reject path separators and path traversal attempts
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    return false;
  }

  // Reject null bytes and control characters
  for (const byte of FORBIDDEN_PATH_BYTES) {
    if (name.includes(byte)) return false;
  }

  // Reject Windows reserved names
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(name.split('.')[0])) return false;

  // Reject names ending with dot or space (Windows)
  if (name.endsWith('.') || name.endsWith(' ')) return false;

  return true;
}

/**
 * Safely join root + user-supplied relative path.
 * Validates the result stays within root.
 *
 * @param {string} root
 * @param {...string} segments
 * @returns {string} - Resolved path within root
 * @throws {Error} - If result escapes root
 */
export function safeJoin(root, ...segments) {
  const joined = path.join(root, ...segments);
  return assertWithinRoot(root, joined);
}

/**
 * Atomic write with temporary file + rename (prevents partial writes).
 * Validates path stays within root before writing.
 *
 * @param {string} root - Root directory for containment (used when targetPath is relative)
 * @param {string} targetPath - Target path (absolute or relative to root)
 * @param {string|Buffer} content
 * @param {{ encoding?: string, mode?: number }} [options]
 * @param {boolean} [allowOutside=false] - If true, allows writing outside root
 * @returns {Promise<void>}
 */
export async function atomicWrite(root, targetPath, content, options = {}, allowOutside = false) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(resolvedRoot, targetPath);
  
  // Validate containment unless explicitly allowed
  if (!allowOutside) {
    const relative = path.relative(resolvedRoot, resolvedTarget);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path traversal blocked: '${targetPath}' escapes root '${root}'`);
    }
  }

  const dir = path.dirname(resolvedTarget);
  const tmpName = `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpPath = path.join(dir, tmpName);

  // Ensure directory exists
  await fs.promises.mkdir(dir, { recursive: true });

  // Write to temp file
  await fs.promises.writeFile(tmpPath, content, options);

  // Atomic rename (POSIX guarantee)
  await fs.promises.rename(tmpPath, resolvedTarget);
}

/**
 * Synchronous atomic write variant.
 *
 * @param {string} root - Root directory for containment (used when relativePath is relative)
 * @param {string} targetPath - Target path (absolute or relative to root)
 * @param {string|Buffer} content
 * @param {{ encoding?: string, mode?: number }} [options]
 * @param {boolean} [allowOutside=false] - If true, allows writing outside root
 */
export function atomicWriteSync(root, targetPath, content, options = {}, allowOutside = false) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(resolvedRoot, targetPath);
  
  // Validate containment unless explicitly allowed
  if (!allowOutside) {
    const relative = path.relative(resolvedRoot, resolvedTarget);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path traversal blocked: '${targetPath}' escapes root '${root}'`);
    }
  }

  const dir = path.dirname(resolvedTarget);
  const tmpName = `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpPath = path.join(dir, tmpName);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmpPath, content, options);
  fs.renameSync(tmpPath, resolvedTarget);
}

/**
 * Safe directory traversal with depth limiting and symlink protection.
 *
 * @param {string} root
 * @param {object} options
 * @param {number} [options.maxDepth=32]
 * @param {number} [options.maxFiles=10000]
 * @param {Set<string>} [options.ignoredDirs]
 * @param {Set<string>} [options.allowedExtensions]
 * @returns {string[]} - Array of absolute file paths within root
 */
export function collectFilesSafe(root, options = {}) {
  const {
    maxDepth = 32,
    maxFiles = 10000,
    ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.cache']),
    allowedExtensions = new Set(),
  } = options;

  const results = [];
  const resolvedRoot = path.resolve(root);

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    if (results.length >= maxFiles) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;

      if (!isSafeFilename(entry.name)) continue;
      if (ignoredDirs.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      // Validate containment
      if (!tryWithinRoot(resolvedRoot, fullPath)) continue;

      // Skip symlinks
      let stat;
      try { stat = fs.lstatSync(fullPath); } catch { continue; }
      if (stat.isSymbolicLink()) continue;

      if (stat.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (stat.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (allowedExtensions.size === 0 || allowedExtensions.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(resolvedRoot, 0);
  return results;
}

/**
 * Create an isolated sandbox temp directory for antigen test execution.
 * The directory is created under the OS temp dir and is safe to use as a
 * clean execution environment.
 *
 * @param {string} [prefix='mse-sandbox-'] - Prefix for the temp dir name
 * @returns {string} - Absolute path to the created temp directory
 */
export function createSandboxTempDir(prefix = 'mse-sandbox-') {
  const tmpBase = process.env.TEMP || process.env.TMP || process.env.TMPDIR || '/tmp';
  const dirName = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dirPath = path.join(tmpBase, dirName);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Remove a previously created sandbox temp directory.
 * Silently ignores errors if the directory no longer exists.
 *
 * @param {string} dirPath - Absolute path to the temp directory
 */
export function cleanupSandboxTempDir(dirPath) {
  try {
    if (dirPath && path.isAbsolute(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {
    // Silently ignore cleanup errors (OS-level locking, already deleted, etc.)
  }
}

export default {
  assertWithinRoot,
  tryWithinRoot,
  isSafeFilename,
  safeJoin,
  atomicWrite,
  atomicWriteSync,
  collectFilesSafe,
  createSandboxTempDir,
  cleanupSandboxTempDir,
  MAX_PATH_LENGTH,
  MAX_FILENAME_LENGTH,
};