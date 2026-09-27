/**
 * Browser-safe path utilities for MSE engine.
 * Replaces node:path for in-browser operation.
 */

export function normalize(p) {
  const parts = String(p).replace(/\\/g, '/').split('/');
  const result = [];
  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }
  return result.join('/');
}

export const normalizePath = normalize;

export function basename(p, ext) {
  const parts = normalize(p).split('/');
  let base = parts[parts.length - 1] || '';
  if (ext && base.endsWith(ext)) {
    base = base.slice(0, -ext.length);
  }
  return base;
}

export function dirname(p) {
  const parts = normalize(p).split('/');
  parts.pop();
  return parts.join('/') || '.';
}

export function extname(p) {
  const base = basename(p);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

export function join(...parts) {
  return normalize(parts.filter(Boolean).join('/'));
}

/**
 * Resolve a relative import against a file's directory.
 * e.g. resolve('src/routes/webhook.js', '../db/pool.js') => 'src/db/pool.js'
 */
export function resolveRelative(fromFile, importPath) {
  if (!importPath.startsWith('.')) return importPath;
  const dir = dirname(fromFile);
  return normalize(dir + '/' + importPath);
}

export { isDangerousPath } from '../utils/securityUtils.js';
