/**
 * MSE Engine — Public API
 *
 * Re-exports all engine modules for convenient consumption.
 */

// Ingestion
export { loadDemoRepository, loadEnterpriseFixture, loadZipRepository, validateSnapshot } from './ingest/index.js';

// Analysis pipeline
export { analyzeRepository } from './repositoryGraph/index.js';
export { analyzeDrift } from './drift/index.js';
export { evaluateInvariants } from './invariants/index.js';
export { generateCounterexamples } from './counterexample/index.js';
export { synthesizePatches } from './patch/index.js';
// Verification & Patch Application
export { verifyPatches, applyPatches, applySinglePatch } from './verify/index.js';
export { generateReport } from './report/index.js';

// Pipeline orchestrator
export { runPipeline, runPipelineAsync } from './pipeline.js';

// Utilities
export * from './pathUtils.js';
