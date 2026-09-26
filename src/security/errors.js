/**
 * Structured Error Handling -- Defensive Error Boundaries
 *
 * Provides:
 * - Typed error classes for different failure modes
 * - Result<T, E> pattern for explicit error handling
 * - Error boundary wrapper for subagent isolation
 * - Structured error serialization
 */

import { ErrorCodes, isErrorCode } from './error-codes.js';

/**
 * Base application error with structured metadata.
 */
export class MSEError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'MSEError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.recoverable = details.recoverable ?? true;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      stack: this.stack,
    };
  }
}

/**
 * Path traversal / filesystem security violation.
 */
export class SecurityError extends MSEError {
  constructor(message, details = {}) {
    super(message, ErrorCodes.SECURITY_VIOLATION, { ...details, recoverable: false });
    this.name = 'SecurityError';
  }
}

/**
 * Input validation failure.
 */
export class ValidationError extends MSEError {
  constructor(message, details = {}) {
    super(message, ErrorCodes.VALIDATION_FAILED, { ...details, recoverable: false });
    this.name = 'ValidationError';
  }
}

/**
 * Resource exhaustion (OOM, timeout, file limits).
 */
export class ResourceExhaustedError extends MSEError {
  constructor(message, details = {}) {
    super(message, ErrorCodes.RESOURCE_EXHAUSTED, { ...details, recoverable: false });
    this.name = 'ResourceExhaustedError';
  }
}

/**
 * External dependency failure (child process, network, etc.).
 */
export class DependencyError extends MSEError {
  constructor(message, details = {}) {
    super(message, ErrorCodes.DEPENDENCY_FAILED, { ...details, recoverable: true });
    this.name = 'DependencyError';
  }
}

/**
 * Subagent execution failure.
 */
export class SubagentError extends MSEError {
  constructor(subagentName, message, details = {}) {
    super(message, ErrorCodes.SUBAGENT_FAILED, { ...details, subagent: subagentName, recoverable: true });
    this.name = 'SubagentError';
  }
}

/**
 * ReDoS / regex timeout.
 */
export class RegexTimeoutError extends MSEError {
  constructor(message, details = {}) {
    super(message, ErrorCodes.REGEX_TIMEOUT, { ...details, recoverable: false });
    this.name = 'RegexTimeoutError';
  }
}

/**
 * Result type for explicit error handling (Rust-style).
 * @template T - Success value type
 * @template E - Error type (defaults to MSEError)
 */
export class Result {
  constructor(ok, value, error) {
    this._ok = ok;
    this._value = value;
    this._error = error;
  }

  static ok(value) {
    return new Result(true, value, null);
  }

  static err(error) {
    return new Result(false, null, error);
  }

  isOk() { return this._ok; }
  isErr() { return !this._ok; }

  unwrap() {
    if (!this._ok) throw this._error;
    return this._value;
  }

  unwrapErr() {
    if (this._ok) throw new Error('Called unwrapErr on Ok value');
    return this._error;
  }

  map(fn) {
    if (!this._ok) return this;
    try {
      return Result.ok(fn(this._value));
    } catch (e) {
      return Result.err(e instanceof MSEError ? e : new MSEError(String(e), ErrorCodes.UNKNOWN));
    }
  }

  mapErr(fn) {
    if (this._ok) return this;
    try {
      return Result.err(fn(this._error));
    } catch (e) {
      return Result.err(e instanceof MSEError ? e : new MSEError(String(e), ErrorCodes.UNKNOWN));
    }
  }

  andThen(fn) {
    if (!this._ok) return this;
    try {
      const result = fn(this._value);
      return result instanceof Result ? result : Result.ok(result);
    } catch (e) {
      return Result.err(e instanceof MSEError ? e : new MSEError(String(e), ErrorCodes.UNKNOWN));
    }
  }

  orElse(fn) {
    if (this._ok) return this;
    try {
      const result = fn(this._error);
      return result instanceof Result ? result : Result.ok(result);
    } catch (e) {
      return Result.err(e instanceof MSEError ? e : new MSEError(String(e), ErrorCodes.UNKNOWN));
    }
  }

  toJSON() {
    if (this._ok) {
      return { ok: true, value: this._value };
    }
    return { ok: false, error: this._error?.toJSON?.() || { message: String(this._error) } };
  }
}

/**
 * Wrap a synchronous function with structured error handling.
 *
 * @template T
 * @param {() => T} fn
 * @param {object} [context] - Additional context for error
 * @returns {Result<T, MSEError>}
 */
export function trySync(fn, context = {}) {
  try {
    return Result.ok(fn());
  } catch (e) {
    const error = e instanceof MSEError ? e : new MSEError(String(e), ErrorCodes.UNKNOWN, context);
    return Result.err(error);
  }
}

/**
 * Wrap an asynchronous function with structured error handling.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object} [context]
 * @returns {Promise<Result<T, MSEError>>}
 */
export async function tryAsync(fn, context = {}) {
  try {
    const value = await fn();
    return Result.ok(value);
  } catch (e) {
    const error = e instanceof MSEError ? e : new MSEError(String(e), ErrorCodes.UNKNOWN, context);
    return Result.err(error);
  }
}

/**
 * Error boundary for subagent execution.
 * Catches all errors, logs them, and returns a structured failure result.
 * Prevents one subagent crash from taking down the orchestrator.
 *
 * @template T
 * @param {string} subagentName - Name for logging
 * @param {() => Promise<T>} fn - Subagent main function
 * @param {object} [fallback] - Fallback value on failure
 * @returns {Promise<Result<T, SubagentError>>}
 */
export async function withErrorBoundary(subagentName, fn, fallback = null) {
  const startTime = Date.now();
  try {
    const result = await fn();
    return Result.ok(result);
  } catch (e) {
    const durationMs = Date.now() - startTime;
    const error = e instanceof MSEError
      ? e
      : new SubagentError(subagentName, String(e), {
          cause: e?.message,
          stack: e?.stack,
          durationMs,
        });

    // Structured logging for debugging
    console.error(`[${subagentName}] ERROR:`, error.toJSON());

    if (fallback !== null) {
      return Result.ok(fallback);
    }
    return Result.err(error);
  }
}

/**
 * Safe dictionary/array access with default.
 * Eliminates "cannot read property of undefined" errors.
 *
 * @template T
 * @param {Record<string, T>|T[]|null|undefined} obj
 * @param {string|number} key
 * @param {T} [defaultValue]
 * @returns {T}
 */
export function safeGet(obj, key, defaultValue = null) {
  if (obj === null || obj === undefined) return defaultValue;
  const value = obj[key];
  return value !== undefined ? value : defaultValue;
}

/**
 * Safe property access with type validation.
 *
 * @template T
 * @param {unknown} obj
 * @param {string} key
 * @param {(value: unknown) => value is T} guard
 * @param {T} [defaultValue]
 * @returns {T}
 */
export function safeGetTyped(obj, key, guard, defaultValue = null) {
  const value = safeGet(obj, key);
  if (value !== null && value !== undefined && guard(value)) {
    return value;
  }
  return defaultValue;
}

/**
 * Assert a condition, throwing a structured error if false.
 *
 * @param {boolean} condition
 * @param {string} message
 * @param {string} [code]
 * @param {object} [details]
 */
export function assert(condition, message, code = ErrorCodes.ASSERTION_FAILED, details = {}) {
  if (!condition) {
    throw new MSEError(message, code, details);
  }
}

/**
 * Ensure a value is not null/undefined.
 *
 * @template T
 * @param {T|null|undefined} value
 * @param {string} message
 * @returns {T}
 */
export function ensure(value, message = 'Expected value to be defined') {
  if (value === null || value === undefined) {
    throw new ValidationError(message, { code: ErrorCodes.NULL_UNDEFINED });
  }
  return value;
}

/**
 * Narrow a union type with a type guard.
 *
 * @template T
 * @param {T|null|undefined} value
 * @param {(value: T) => boolean} guard
 * @returns {value is T}
 */
export function isDefined(value, guard) {
  return value !== null && value !== undefined && guard(value);
}

/**
 * Collect all errors from an array of Results.
 *
 * @template T, E
 * @param {Result<T, E>[]} results
 * @returns {E[]}
 */
export function collectErrors(results) {
  return results.filter(r => r.isErr()).map(r => r.unwrapErr());
}

/**
 * Partition results into successes and failures.
 *
 * @template T, E
 * @param {Result<T, E>[]} results
 * @returns {{ ok: T[], err: E[] }}
 */
export function partitionResults(results) {
  const ok = [];
  const err = [];
  for (const r of results) {
    if (r.isOk()) ok.push(r.unwrap());
    else err.push(r.unwrapErr());
  }
  return { ok, err };
}

export default {
  MSEError,
  SecurityError,
  ValidationError,
  ResourceExhaustedError,
  DependencyError,
  SubagentError,
  RegexTimeoutError,
  Result,
  trySync,
  tryAsync,
  withErrorBoundary,
  safeGet,
  safeGetTyped,
  assert,
  ensure,
  isDefined,
  collectErrors,
  partitionResults,
};