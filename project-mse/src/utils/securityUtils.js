/**
 * Project MSE Security Utilities
 *
 * Hardened sanitization and validation primitives:
 * - Path traversal defense (Zip Slip, UNC, Windows drives, encoded traversal)
 * - Binary magic-bytes detection
 * - Download filename sanitization
 * - Strict URL validation
 * - Prototype pollution defense
 * - ReDoS string length bounding
 */

/**
 * Validates whether a file path contains directory traversal, UNC paths,
 * Windows absolute drives, encoded traversals, or prototype pollution tokens.
 *
 * @param {string} p
 * @returns {boolean} True if the path is dangerous and must be rejected.
 */
export function isDangerousPath(p) {
  if (typeof p !== 'string' || !p.trim()) return true;

  // 1. Reject null bytes and control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(p)) return true;

  // 2. Decode URI components safely if percent-encoded
  let decoded = p;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    // Malformed URI encoding is suspicious -> reject
    return true;
  }

  // 3. Normalize backslashes to forward slashes for cross-platform evaluation
  const normalizedRaw = decoded.replace(/\\/g, '/');

  // 4. Check for absolute paths (POSIX leading slash or Windows drive letter)
  if (normalizedRaw.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(decoded)) {
    return true;
  }

  // 5. Check for UNC paths (//server/share or \\server\share)
  if (decoded.startsWith('//') || decoded.startsWith('\\\\')) {
    return true;
  }

  // 6. Check for directory traversal sequences and prototype pollution keys
  const segments = normalizedRaw.split('/');
  for (const seg of segments) {
    if (seg === '..') return true;
    if (seg === '__proto__' || seg === 'constructor' || seg === 'prototype') return true;
  }

  // 7. Check if path starts with dot-dot
  if (normalizedRaw.startsWith('../') || normalizedRaw === '..') return true;

  return false;
}

/**
 * Detects whether a raw byte buffer contains executable or non-text binary signatures.
 * Inspects both standard magic bytes and the presence of null bytes in the header.
 *
 * @param {Uint8Array} bytes
 * @returns {boolean} True if the file content is binary.
 */
export function hasBinaryMagicBytes(bytes) {
  if (!bytes || bytes.length === 0) return false;

  // ELF binary: 0x7F 'E' 'L' 'F'
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return true;

  // Windows PE (MZ header): 'M' 'Z'
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return true;

  // Mach-O binary (32-bit / 64-bit / big-endian / little-endian)
  if ((bytes[0] === 0xfe && bytes[1] === 0xed && bytes[2] === 0xfa && bytes[3] === 0xce) ||
      (bytes[0] === 0xce && bytes[1] === 0xfa && bytes[2] === 0xed && bytes[3] === 0xfe) ||
      (bytes[0] === 0xfe && bytes[1] === 0xed && bytes[2] === 0xfa && bytes[3] === 0xcf) ||
      (bytes[0] === 0xcf && bytes[1] === 0xfa && bytes[2] === 0xed && bytes[3] === 0xfe)) {
    return true;
  }

  // PNG image: 0x89 'P' 'N' 'G'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;

  // JPEG image: 0xFF 0xD8 0xFF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;

  // GIF image: 'G' 'I' 'F' '8'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;

  // PDF document: '%PDF'
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true;

  // Java class file: 0xCA 0xFE 0xBA 0xBE
  if (bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && bytes[3] === 0xbe) return true;

  // ZIP archive magic: 'PK\x03\x04'
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return true;

  // WebAssembly binary: 0x00 'a' 's' 'm'
  if (bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d) return true;

  // General heuristic: check first 4096 bytes for null characters (\0)
  const scanLimit = Math.min(bytes.length, 4096);
  for (let i = 0; i < scanLimit; i++) {
    if (bytes[i] === 0) return true;
  }

  return false;
}

/**
 * Sanitizes a filename for safe browser downloads.
 * Strips path separators, directory traversal, control characters,
 * and restricts output to safe alphanumeric, hyphen, dot, and underscore characters.
 *
 * @param {string} filename
 * @param {string} [fallback='download.txt']
 * @returns {string} Sanitized filename
 */
export function sanitizeDownloadFilename(filename, fallback = 'download.txt') {
  if (typeof filename !== 'string' || !filename.trim()) return fallback;

  // Strip path separators, directory traversal, control characters
  let clean = filename
    .replace(/\\/g, '/')
    .split('/')
    .pop() // Take only base name
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '') // Strip control chars
    .replace(/[^a-zA-Z0-9._-]/g, '_'); // Replace unsafe chars with underscore

  // Collapse multiple dots or leading dots
  clean = clean.replace(/^\.+/, '').replace(/\.{2,}/g, '.');

  if (!clean || clean === '.' || clean === '..') {
    return fallback;
  }

  return clean.slice(0, 128); // Bound maximum filename length
}

/**
 * Validates that a URL is strictly safe for display or navigation.
 * Only allows http: and https: protocols.
 * Disallows javascript:, data:, file:, vbscript:, and embedded credentials.
 *
 * @param {string} urlString
 * @returns {boolean} True if the URL is strictly safe.
 */
export function isSafeUrl(urlString) {
  if (typeof urlString !== 'string' || !urlString.trim()) return false;

  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    // Reject embedded credentials (e.g. https://user:pass@evil.com)
    if (parsed.username || parsed.password) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Escapes characters for HTML contexts to prevent injection.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Bounds text length before regex evaluation to protect against catastrophic backtracking.
 *
 * @param {RegExp} regex
 * @param {string} text
 * @param {number} [maxLen=4096]
 * @returns {RegExpExecArray | null}
 */
export function safeRegexExec(regex, text, maxLen = 4096) {
  if (typeof text !== 'string') return null;
  const bounded = text.length > maxLen ? text.slice(0, maxLen) : text;
  return regex.exec(bounded);
}
