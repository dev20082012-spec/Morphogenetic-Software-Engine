/**
 * JSDoc type definitions for Symbiote data structures.
 * No runtime code.
 *
 * @module symbiote-types
 */

/**
 * @typedef {{
 *   sourceFile: string,
 *   sourceKind: 'markdown',
 *   portBindings: string[],
 *   envVars: string[],
 *   requiredHeaders: string[],
 *   authSchemes: string[],
 *   runtimeVersions: string[],
 *   dbUrls: string[],
 *   rawText: string,
 * }} ProseClaims
 *
 * @typedef {{
 *   sourceFile: string,
 *   sourceKind: 'openapi',
 *   title: string|null,
 *   version: string|null,
 *   portBindings: string[],
 *   envVars: string[],
 *   requiredHeaders: string[],
 *   authSchemes: string[],
 *   routes: { path: string, method: string }[],
 *   rawText: string,
 * }} OpenAPIClaims
 *
 * @typedef {{
 *   sourceFile: string,
 *   portBindings: string[],
 *   envVars: string[],
 *   requiredHeaders: string[],
 *   authSchemes: string[],
 * }} CodeClaims
 *
 * @typedef {{
 *   allPorts: string[],
 *   allEnvVars: string[],
 *   allHeaders: string[],
 *   allAuthSchemes: string[],
 *   allRoutes: { path: string, method: string, sourceFile: string }[],
 *   runtimeVersions: string[],
 * }} AggregatedClaims
 */

export {};
