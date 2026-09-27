/**
 * MSE Engine Type Definitions (JSDoc)
 *
 * Central type definitions for the in-browser MSE analysis engine.
 * All types are defined as JSDoc typedefs for editor support without
 * requiring a TypeScript compilation step.
 */

/**
 * @typedef {{
 *   path: string,
 *   content: string,
 *   language?: string,
 * }} RepositoryFile
 */

/**
 * @typedef {{
 *   files: RepositoryFile[],
 *   metadata: {
 *     source: 'demo' | 'zip',
 *     name: string,
 *     loadedAt: string,
 *     description?: string,
 *     fileCount?: number,
 *     totalBytes?: number,
 *   },
 * }} RepositorySnapshot
 */

/**
 * @typedef {{
 *   id: string,
 *   type: 'security' | 'drift' | 'data-integrity' | 'correctness' | 'configuration',
 *   severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
 *   title: string,
 *   description: string,
 *   sourceEvidence: Evidence[],
 *   documentationEvidence: Evidence[],
 *   confidence: 'high' | 'medium' | 'low',
 * }} Finding
 */

/**
 * @typedef {{
 *   file: string,
 *   line?: number,
 *   excerpt?: string,
 *   context?: string,
 * }} Evidence
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   category: string,
 *   statement: string,
 *   evidence: Evidence[],
 *   status: 'violated' | 'satisfied' | 'unknown',
 *   linkedFindingIds: string[],
 * }} Invariant
 */

/**
 * @typedef {{
 *   id: string,
 *   findingId: string,
 *   invariantId: string,
 *   description: string,
 *   scenario: string,
 *   testCode: string,
 *   rootCause: string,
 * }} Counterexample
 */

/**
 * @typedef {{
 *   id: string,
 *   findingId: string,
 *   targetFile: string,
 *   strategy: string,
 *   description: string,
 *   diff: string,
 *   filesChanged: string[],
 *   confidence: 'high' | 'medium' | 'low',
 * }} Patch
 */

/**
 * @typedef {{
 *   status: 'VERIFIED' | 'FAILED',
 *   checks: VerificationCheck[],
 *   evidence: Evidence[],
 *   durationMs: number,
 * }} VerificationResult
 */

/**
 * @typedef {{
 *   name: string,
 *   status: 'passed' | 'failed',
 *   detail: string,
 * }} VerificationCheck
 */

export default {};
