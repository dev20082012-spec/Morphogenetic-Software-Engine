// Compatibility entry point for the safe, in-memory patch applier.
// Patches alter RepositorySnapshot data only; no repository code is executed.
export { applyPatches, applySinglePatch } from '../verify/index.js';
export {
  computeRevisionId,
  applyPatchAtomically,
  revertPatchAtomically,
  detectPatchCollision,
  getFileModificationState
} from '../patchLifecycle.js';

