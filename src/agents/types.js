/**
 * JSDoc type definitions for Morphologist data structures.
 * No runtime code -- imported only for documentation purposes.
 *
 * @module types
 */

/**
 * @typedef {{ lineNumber: number, excerpt: string }} SiteMention
 *
 * @typedef {{
 *   path: string,
 *   isEntryPoint: boolean,
 *   lineCount: number,
 *   exports: string[],
 *   dependencies: string[],
 *   routes: (SiteMention & { method: string })[],
 *   asyncBoundaries: SiteMention[],
 *   stateMutations: SiteMention[],
 *   latentInvariants: {
 *     mutexLifecycles: SiteMention[],
 *     transactionBoundaries: SiteMention[],
 *     tokenValidationSequences: SiteMention[],
 *   },
 * }} FileTopology
 *
 * @typedef {{
 *   id: string,
 *   type: 'SECURITY' | 'CONCURRENCY' | 'DATA_INTEGRITY' | 'CORRECTNESS',
 *   name: string,
 *   description: string,
 *   severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
 *   affectedFiles: string[],
 *   evidence: SiteMention[],
 * }} LatentInvariant
 *
 * @typedef {{
 *   schemaVersion: string,
 *   generatedAt: string,
 *   repositoryRoot: string,
 *   summary: {
 *     totalFilesScanned: number,
 *     entryPointCount: number,
 *     routeCount: number,
 *     asyncBoundaryCount: number,
 *     stateMutationCount: number,
 *     invariantViolations: number,
 *     criticalViolations: number,
 *   },
 *   entryPoints: string[],
 *   routeManifest: (SiteMention & { file: string, method: string })[],
 *   componentTopology: FileTopology[],
 *   dependencyGraph: Record<string, string[]>,
 *   discoveredInvariants: LatentInvariant[],
 * }} MorphologistReport
 */

export {};
