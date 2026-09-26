/**
 * Standardized Error Codes for MSE
 *
 * All errors use these codes for consistent handling and debugging.
 */

export const ErrorCodes = {
  // Security
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
  SYMLINK_ESCAPE: 'SYMLINK_ESCAPE',
  INVALID_INPUT: 'INVALID_INPUT',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NULL_UNDEFINED: 'NULL_UNDEFINED',
  TYPE_MISMATCH: 'TYPE_MISMATCH',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Resources
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  MEMORY_LIMIT: 'MEMORY_LIMIT',
  TIMEOUT: 'TIMEOUT',
  FILE_LIMIT: 'FILE_LIMIT',
  BUFFER_OVERFLOW: 'BUFFER_OVERFLOW',

  // Dependencies
  DEPENDENCY_FAILED: 'DEPENDENCY_FAILED',
  CHILD_PROCESS_FAILED: 'CHILD_PROCESS_FAILED',
  MODULE_NOT_FOUND: 'MODULE_NOT_FOUND',
  VERSION_MISMATCH: 'VERSION_MISMATCH',

  // Subagents
  SUBAGENT_FAILED: 'SUBAGENT_FAILED',
  SUBAGENT_TIMEOUT: 'SUBAGENT_TIMEOUT',
  SUBAGENT_CRASHED: 'SUBAGENT_CRASHED',

  // Regex
  REGEX_TIMEOUT: 'REGEX_TIMEOUT',
  REGEX_INVALID: 'REGEX_INVALID',

  // Internal
  UNKNOWN: 'UNKNOWN',
  ASSERTION_FAILED: 'ASSERTION_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

/**
 * Check if a value is a valid error code.
 * @param {unknown} code
 * @returns {code is ErrorCodes[keyof ErrorCodes]}
 */
export function isErrorCode(code) {
  return typeof code === 'string' && Object.values(ErrorCodes).includes(code);
}

/**
 * Get HTTP-like status code for an error code.
 * @param {string} code
 * @returns {number}
 */
export function getStatusCode(code) {
  const statusMap = {
    [ErrorCodes.SECURITY_VIOLATION]: 403,
    [ErrorCodes.PATH_TRAVERSAL]: 403,
    [ErrorCodes.VALIDATION_FAILED]: 400,
    [ErrorCodes.NULL_UNDEFINED]: 400,
    [ErrorCodes.TYPE_MISMATCH]: 400,
    [ErrorCodes.OUT_OF_RANGE]: 400,
    [ErrorCodes.INVALID_FORMAT]: 400,
    [ErrorCodes.RESOURCE_EXHAUSTED]: 503,
    [ErrorCodes.TIMEOUT]: 504,
    [ErrorCodes.MEMORY_LIMIT]: 507,
    [ErrorCodes.FILE_LIMIT]: 507,
    [ErrorCodes.BUFFER_OVERFLOW]: 500,
    [ErrorCodes.DEPENDENCY_FAILED]: 502,
    [ErrorCodes.CHILD_PROCESS_FAILED]: 502,
    [ErrorCodes.MODULE_NOT_FOUND]: 500,
    [ErrorCodes.VERSION_MISMATCH]: 500,
    [ErrorCodes.SUBAGENT_FAILED]: 500,
    [ErrorCodes.SUBAGENT_TIMEOUT]: 504,
    [ErrorCodes.SUBAGENT_CRASHED]: 500,
    [ErrorCodes.REGEX_TIMEOUT]: 500,
    [ErrorCodes.REGEX_INVALID]: 500,
    [ErrorCodes.ASSERTION_FAILED]: 500,
    [ErrorCodes.NOT_IMPLEMENTED]: 501,
    [ErrorCodes.INTERNAL_ERROR]: 500,
  };
  return statusMap[code] || 500;
}

/**
 * Check if an error code represents a recoverable error.
 * @param {string} code
 * @returns {boolean}
 */
export function isRecoverable(code) {
  const recoverable = new Set([
    ErrorCodes.DEPENDENCY_FAILED,
    ErrorCodes.CHILD_PROCESS_FAILED,
    ErrorCodes.MODULE_NOT_FOUND,
    ErrorCodes.SUBAGENT_FAILED,
    ErrorCodes.SUBAGENT_TIMEOUT,
    ErrorCodes.VERSION_MISMATCH,
  ]);
  return recoverable.has(code);
}

export default { ErrorCodes, isErrorCode, getStatusCode, isRecoverable };