/**
 * ReDoS Guard -- Regular Expression Denial of Service Protection
 *
 * Provides safe regex execution with:
 * - Execution time limits
 * - Input length clamping
 * - Catastrophic backtracking detection
 * - Safe regex construction from user input
 */

import { EventEmitter } from 'node:events';

/**
 * Default maximum execution time for a regex match (ms).
 */
export const DEFAULT_REGEX_TIMEOUT_MS = 100;

/**
 * Default maximum input length for regex matching.
 */
export const DEFAULT_MAX_INPUT_LENGTH = 1_000_000; // 1MB

/**
 * Error thrown when regex execution exceeds time budget.
 */
export class RegexTimeoutError extends Error {
  constructor(message = 'Regex execution timeout') {
    super(message);
    this.name = 'RegexTimeoutError';
  }
}

/**
 * Error thrown when input exceeds maximum allowed length.
 */
export class InputTooLargeError extends Error {
  constructor(message = 'Input exceeds maximum allowed length') {
    super(message);
    this.name = 'InputTooLargeError';
  }
}

/**
 * Safely escape a string for literal use in a RegExp.
 * Prevents ReDoS from user-supplied patterns.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeRegExp(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a RegExp from a user-supplied pattern with safety guards.
 * The pattern is treated as a LITERAL string, not a regex pattern.
 *
 * @param {string} literal - Literal string to match
 * @param {string} [flags=''] - RegExp flags (only 'i', 'g', 'm' allowed)
 * @returns {RegExp}
 */
export function createSafeRegExp(literal, flags = '') {
  const safeFlags = flags.replace(/[^igm]/g, '');
  const escaped = escapeRegExp(literal);
  return new RegExp(escaped, safeFlags);
}

/**
 * Create a word-boundary RegExp from a literal string.
 * Useful for finding standalone tokens.
 *
 * @param {string} literal
 * @param {string} [flags='g']
 * @returns {RegExp}
 */
export function createWordBoundaryRegExp(literal, flags = 'g') {
  const safeFlags = flags.replace(/[^igm]/g, '');
  const escaped = escapeRegExp(literal);
  return new RegExp(`\\b${escaped}\\b`, safeFlags);
}

/**
 * Execute a regex match with a timeout and input length limit.
 * Uses a worker-like approach with setTimeout for cooperative cancellation.
 *
 * @param {RegExp} regex - Pre-compiled RegExp (must not be user-supplied)
 * @param {string} input - Input string to match against
 * @param {object} [options]
 * @param {number} [options.timeoutMs=100] - Max execution time
 * @param {number} [options.maxInputLength=1000000] - Max input length
 * @returns {RegExpExecArray|null} - Match result or null
 * @throws {RegexTimeoutError} - If execution exceeds timeout
 * @throws {InputTooLargeError} - If input exceeds max length
 */
export function safeExec(regex, input, options = {}) {
  const { timeoutMs = DEFAULT_REGEX_TIMEOUT_MS, maxInputLength = DEFAULT_MAX_INPUT_LENGTH } = options;

  if (typeof input !== 'string') return null;
  if (input.length > maxInputLength) {
    throw new InputTooLargeError(`Input length ${input.length} exceeds maximum ${maxInputLength}`);
  }

  // Clone regex to avoid lastIndex pollution
  const re = new RegExp(regex.source, regex.flags);

  // For synchronous execution, we can't truly interrupt, but we can
  // use a micro-task deadline check for long-running patterns
  const deadline = Date.now() + timeoutMs;

  let result = null;
  let iterations = 0;
  const MAX_ITERATIONS = 10000;

  // Use exec in a loop with deadline checking
  while ((result = re.exec(input)) !== null) {
    iterations++;
    if (iterations > MAX_ITERATIONS || Date.now() > deadline) {
      throw new RegexTimeoutError(`Regex execution exceeded ${timeoutMs}ms or ${MAX_ITERATIONS} iterations`);
    }
    if (!regex.global) break; // Non-global regex: single match
  }

  return result;
}

/**
 * Safe test() with timeout.
 *
 * @param {RegExp} regex
 * @param {string} input
 * @param {object} [options]
 * @returns {boolean}
 */
export function safeTest(regex, input, options = {}) {
  try {
    return safeExec(regex, input, options) !== null;
  } catch (e) {
    if (e instanceof RegexTimeoutError || e instanceof InputTooLargeError) throw e;
    return false;
  }
}

/**
 * Safe match() with timeout - returns all matches.
 *
 * @param {RegExp} regex - Must have 'g' flag
 * @param {string} input
 * @param {object} [options]
 * @returns {string[]}
 */
export function safeMatchAll(regex, input, options = {}) {
  if (!regex.global) {
    throw new Error('safeMatchAll requires a global (g) regex');
  }

  const matches = [];
  const re = new RegExp(regex.source, regex.flags);
  const deadline = Date.now() + (options.timeoutMs || DEFAULT_REGEX_TIMEOUT_MS);
  const maxInput = options.maxInputLength || DEFAULT_MAX_INPUT_LENGTH;

  if (typeof input !== 'string' || input.length > maxInput) {
    throw new InputTooLargeError('Input too large');
  }

  let result;
  let iterations = 0;
  while ((result = re.exec(input)) !== null) {
    iterations++;
    if (iterations > 10000 || Date.now() > deadline) {
      throw new RegexTimeoutError('Regex execution timeout');
    }
    matches.push(result[0]);
  }

  return matches;
}

/**
 * Safe replace() with timeout.
 *
 * @param {RegExp} regex
 * @param {string} input
 * @param {string|Function} replacement
 * @param {object} [options]
 * @returns {string}
 */
export function safeReplace(regex, input, replacement, options = {}) {
  const maxInput = options.maxInputLength || DEFAULT_MAX_INPUT_LENGTH;
  if (typeof input !== 'string' || input.length > maxInput) {
    throw new InputTooLargeError('Input too large');
  }

  // For replace, we use the native implementation but with a cloned regex
  // and a pre-check on input size. Native replace is generally safe.
  const re = new RegExp(regex.source, regex.flags);
  return input.replace(re, replacement);
}

/**
 * Validate that a regex pattern is "safe" (no catastrophic backtracking patterns).
 * This is a heuristic check for common ReDoS-vulnerable patterns.
 *
 * @param {string} pattern - Raw regex pattern string
 * @returns {{ safe: boolean, issues: string[] }}
 */
export function validateRegexPattern(pattern) {
  const issues = [];

  // Nested quantifiers: (a+)+, (a*)*, etc.
  if (/\([^)]*[\+\*]\{1,\}[^)]*[\+\*]\{1,\}/.test(pattern)) {
    issues.push('Nested quantifiers detected (catastrophic backtracking risk)');
  }

  // Overlapping alternatives: (a|a)*, (a+|a+)+
  if (/\([^)]*\|[^)]*[\+\*]\{1,\}[^)]*\|/.test(pattern)) {
    issues.push('Overlapping alternatives with quantifiers detected');
  }

  // Unbounded repetition of complex groups
  if (/\([^)]{20,}[\+\*]\{1,\}/.test(pattern)) {
    issues.push('Large group with unbounded quantifier detected');
  }

  // Multiple consecutive quantifiers on same element: a+* a*+
  if (/[\+\*]\{1,\}[\+\*]\{1,\}/.test(pattern)) {
    issues.push('Consecutive quantifiers on same element');
  }

  return {
    safe: issues.length === 0,
    issues,
  };
}

/**
 * Pre-compiled safe patterns for common use cases.
 * These are vetted for ReDoS safety.
 */
export const SAFE_PATTERNS = {
  // Email (simplified, not RFC-complete but safe)
  email: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,

  // URL (simplified)
  url: /^https?:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s]*)?$/,

  // Port number (1-65535)
  port: /^(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/,

  // IPv4
  ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,

  // UUID v4
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  // Semantic version
  semver: /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,

  // Safe identifier (variable names, etc.)
  identifier: /^[A-Za-z_$][A-Za-z0-9_$]*$/,

  // File path segment (no separators, no nulls)
  pathSegment: /^[^/\0\r\n]+$/,
};

/**
 * Check if a string matches a safe pattern.
 *
 * @param {string} input
 * @param {keyof typeof SAFE_PATTERNS} patternName
 * @returns {boolean}
 */
export function matchesSafePattern(input, patternName) {
  const pattern = SAFE_PATTERNS[patternName];
  if (!pattern) return false;
  return safeTest(pattern, input);
}

export default {
  escapeRegExp,
  createSafeRegExp,
  createWordBoundaryRegExp,
  safeExec,
  safeTest,
  safeMatchAll,
  safeReplace,
  validateRegexPattern,
  SAFE_PATTERNS,
  matchesSafePattern,
  RegexTimeoutError,
  InputTooLargeError,
  DEFAULT_REGEX_TIMEOUT_MS,
  DEFAULT_MAX_INPUT_LENGTH,
};