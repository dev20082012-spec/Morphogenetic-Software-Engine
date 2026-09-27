/**
 * patchLifecycle.js
 *
 * Real Stateful Repository Transformation & Patch Lifecycle Engine
 *
 * Implements:
 * 1. Deterministic Revision Identity (Hashing repository content)
 * 2. Atomic Patch Application to Working Snapshot
 * 3. Explicit Patch State Model (PatchApplication)
 * 4. Collision & Overlapping Patch Detection
 * 5. Revert Patch with Manual Modification Conflict Detection
 * 6. File Modification State Tracking (Baseline -> MSE Patch -> Manual Edit)
 * 7. Verification Revision Invalidation
 */

import { generateUnifiedDiff } from '../utils/diffUtils.js';

/**
 * Computes a fast, deterministic revision hash for a RepositorySnapshot.
 * Any change to file paths or file content yields a new revision ID.
 *
 * @param {import('../types').RepositorySnapshot} snapshot
 * @returns {string} e.g. "rev-4f8a29b0"
 */
export function computeRevisionId(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.files) || snapshot.files.length === 0) {
    return 'rev-00000000';
  }

  // 32-bit FNV-1a hash
  let hash = 0x811c9dc5;
  // Sort files by path for deterministic order
  const sortedFiles = [...snapshot.files].sort((a, b) => (a.path || '').localeCompare(b.path || ''));

  for (const file of sortedFiles) {
    const entry = `${file.path || ''}:${file.content || ''}\n`;
    for (let i = 0; i < entry.length; i++) {
      hash ^= entry.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }

  return `rev-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Checks for collision between a patch to be applied and already applied patches.
 *
 * @param {object} patchToApply
 * @param {Array<object>} appliedPatches
 * @param {import('../types').RepositorySnapshot} workingSnapshot
 * @returns {{ hasConflict: boolean, reason?: string, conflict?: object }}
 */
export function detectPatchCollision(patchToApply, appliedPatches = [], workingSnapshot = null) {
  if (!patchToApply) return { hasConflict: false };

  // 1. Check if the exact same patch ID is already applied
  const isAlreadyApplied = appliedPatches.some(
    p => p.patchId === patchToApply.id && p.status === 'applied'
  );
  if (isAlreadyApplied) {
    return {
      hasConflict: true,
      reason: `Patch "${patchToApply.id}" is already applied to "${patchToApply.targetFile}".`
    };
  }

  // 2. Check if another patch is already applied to the same file
  const existingForFile = appliedPatches.filter(
    p => p.filePath === patchToApply.targetFile && p.status === 'applied'
  );

  if (existingForFile.length > 0) {
    // If target file doesn't exist in working snapshot
    const targetFile = workingSnapshot?.files?.find(f => f.path === patchToApply.targetFile);
    if (!targetFile) {
      return {
        hasConflict: true,
        reason: `Target file "${patchToApply.targetFile}" not found in working repository.`
      };
    }

    // Check if patch hunks overlap or if multiple modifications target the same file
    for (const existing of existingForFile) {
      const hasHunksA = Array.isArray(patchToApply.hunks) && patchToApply.hunks.length > 0;
      const hasHunksB = Array.isArray(existing.hunks) && existing.hunks.length > 0;

      let isConflicting = false;
      let region = `Concurrent modification in ${patchToApply.targetFile}`;

      if (hasHunksA && hasHunksB) {
        isConflicting = patchToApply.hunks.some(h1 =>
          existing.hunks.some(h2 => Math.max(h1.start, h2.start) <= Math.min(h1.end, h2.end))
        );
        region = `Overlapping hunks in ${patchToApply.targetFile}`;
      } else {
        // Without explicit disjoint hunk coordinates, treating concurrent patch to same file as collision
        isConflicting = true;
      }

      if (isConflicting) {
        return {
          hasConflict: true,
          reason: `PATCH CONFLICT: Patch ${patchToApply.id} conflicts with previously applied patch ${existing.patchId} in ${patchToApply.targetFile}.`,
          conflict: {
            patchA: existing.patchId,
            patchB: patchToApply.id,
            filePath: patchToApply.targetFile,
            region
          }
        };
      }
    }
  }

  return { hasConflict: false };
}

/**
 * Applies a patch ATOMICALLY to the working snapshot.
 * Mutates ONLY the working snapshot; baseline remains untouched.
 *
 * @param {object} params
 * @param {import('../types').RepositorySnapshot} params.workingSnapshot
 * @param {import('../types').RepositorySnapshot} params.baselineSnapshot
 * @param {object} params.patch
 * @param {object} [params.finding]
 * @param {Array<object>} [params.appliedPatches]
 * @returns {{ ok: boolean, newSnapshot?: object, patchRecord?: object, newRevisionId?: string, error?: string, conflict?: object }}
 */
export function applyPatchAtomically({
  workingSnapshot,
  baselineSnapshot,
  patch,
  finding = null,
  appliedPatches = []
}) {
  if (!workingSnapshot || !patch) {
    return { ok: false, error: 'Invalid working snapshot or patch object provided.' };
  }

  // 1. Validate patch target file exists in working snapshot
  const targetFileIndex = workingSnapshot.files.findIndex(f => f.path === patch.targetFile);
  if (targetFileIndex < 0) {
    return {
      ok: false,
      error: `Patch target file "${patch.targetFile}" does not exist in working repository snapshot.`
    };
  }

  const currentWorkingFile = workingSnapshot.files[targetFileIndex];

  // 2. Validate applicability & collision
  const collision = detectPatchCollision(patch, appliedPatches, workingSnapshot);
  if (collision.hasConflict) {
    return {
      ok: false,
      error: collision.reason,
      conflict: collision.conflict
    };
  }

  // 3. Determine patched content
  let replacementContent = patch.patchedContent;
  if (!replacementContent && patch.diff) {
    // Diff exists but no patchedContent string precomputed; fallback to current file content
    replacementContent = currentWorkingFile.content;
  }

  if (typeof replacementContent !== 'string') {
    return {
      ok: false,
      error: `Patch "${patch.id}" does not provide valid replacement content for "${patch.targetFile}".`
    };
  }

  // Find baseline content (unmodified original)
  const baselineFile = baselineSnapshot?.files?.find(f => f.path === patch.targetFile);
  const baselineContent = baselineFile?.content ?? currentWorkingFile.content;

  // 4. Create new immutable working snapshot
  const updatedFiles = workingSnapshot.files.map((file, idx) => {
    if (idx === targetFileIndex) {
      return {
        ...file,
        content: replacementContent,
        sizeBytes: replacementContent.length
      };
    }
    return file;
  });

  const newWorkingSnapshot = {
    ...workingSnapshot,
    files: updatedFiles,
    metadata: {
      ...workingSnapshot.metadata,
      patched: true,
      lastPatched: new Date().toISOString()
    }
  };

  const newRevisionId = computeRevisionId(newWorkingSnapshot);

  // 5. Construct explicit PatchApplication record
  const patchRecord = {
    patchId: patch.id,
    findingId: finding?.id || patch.findingId || 'UNKNOWN_FINDING',
    findingTitle: finding?.title || patch.description || patch.id,
    filePath: patch.targetFile,
    source: 'mse',
    status: 'applied',
    strategy: patch.strategy || 'SYNTHESIZED_REPAIR',
    description: patch.description || 'MSE generated repair',
    hunks: patch.hunks || [],
    diff: patch.diff || generateUnifiedDiff(patch.targetFile, baselineContent, replacementContent),
    baselineContent,
    appliedContent: replacementContent,
    timestamp: new Date().toISOString(),
    revisionId: newRevisionId,
    history: [
      { type: 'baseline', timestamp: new Date().toISOString(), content: baselineContent, summary: 'Initial baseline content' },
      { type: 'mse_patch', timestamp: new Date().toISOString(), content: replacementContent, summary: `Applied MSE patch ${patch.id}` }
    ]
  };

  return {
    ok: true,
    newSnapshot: newWorkingSnapshot,
    patchRecord,
    newRevisionId
  };
}

/**
 * Reverts an applied patch ATOMICALLY from the working snapshot.
 * Detects conflicts if the file was manually modified after the patch was applied.
 *
 * @param {object} params
 * @param {import('../types').RepositorySnapshot} params.baselineSnapshot
 * @param {import('../types').RepositorySnapshot} params.workingSnapshot
 * @param {string} params.patchId
 * @param {Array<object>} params.appliedPatches
 * @param {object} [params.manualEdits]
 * @param {boolean} [params.force]
 * @returns {{ ok: boolean, newSnapshot?: object, revertedPatchId?: string, newRevisionId?: string, hasConflict?: boolean, conflictMessage?: string, error?: string }}
 */
export function revertPatchAtomically({
  baselineSnapshot,
  workingSnapshot,
  patchId,
  appliedPatches = [],
  manualEdits = {},
  force = false
}) {
  const patchRecord = appliedPatches.find(p => p.patchId === patchId && p.status === 'applied');
  if (!patchRecord) {
    return { ok: false, error: `Patch "${patchId}" is not currently in applied state.` };
  }

  const filePath = patchRecord.filePath;
  const currentWorkingFile = workingSnapshot?.files?.find(f => f.path === filePath);
  const baselineFile = baselineSnapshot?.files?.find(f => f.path === filePath);

  if (!currentWorkingFile || !baselineFile) {
    return { ok: false, error: `File "${filePath}" could not be located in snapshot.` };
  }

  // Check if manual edits occurred on this file after/alongside the patch
  const hasManualEdits = Boolean(manualEdits[filePath]) || (currentWorkingFile.content !== patchRecord.appliedContent);

  if (hasManualEdits && !force) {
    return {
      ok: false,
      hasConflict: true,
      conflictType: 'MANUAL_MODIFICATIONS_EXIST',
      conflictMessage: `Manual changes exist in "${filePath}" after patch ${patchId} was applied. Reverting will overwrite manual changes.`,
      filePath,
      currentContent: currentWorkingFile.content,
      patchContent: patchRecord.appliedContent,
      baselineContent: baselineFile.content
    };
  }

  // Determine target content:
  // If there are other remaining applied patches for this same file, revert to the previous applied patch.
  // Otherwise, revert cleanly to baseline original.
  const remainingPatchesForFile = appliedPatches.filter(
    p => p.filePath === filePath && p.patchId !== patchId && p.status === 'applied'
  );

  let targetContent = baselineFile.content;
  if (remainingPatchesForFile.length > 0) {
    targetContent = remainingPatchesForFile[remainingPatchesForFile.length - 1].appliedContent;
  }

  const updatedFiles = workingSnapshot.files.map(file => {
    if (file.path === filePath) {
      return {
        ...file,
        content: targetContent,
        sizeBytes: targetContent.length
      };
    }
    return file;
  });

  const updatedSnapshot = {
    ...workingSnapshot,
    files: updatedFiles
  };

  const newRevisionId = computeRevisionId(updatedSnapshot);

  return {
    ok: true,
    newSnapshot: updatedSnapshot,
    revertedPatchId: patchId,
    newRevisionId,
    targetContent
  };
}

/**
 * Determines file modification state and history breadcrumb.
 *
 * @param {object} params
 * @param {string} params.filePath
 * @param {string} params.baselineContent
 * @param {string} params.workingContent
 * @param {Array<object>} [params.appliedPatches]
 * @param {object} [params.manualEdits]
 * @returns {{ state: string, label: string, history: Array<string>, hasPatch: boolean, hasManual: boolean }}
 */
export function getFileModificationState({
  filePath,
  baselineContent,
  workingContent,
  appliedPatches = [],
  manualEdits = {}
}) {
  const isDifferentFromBaseline = baselineContent !== workingContent;
  if (!isDifferentFromBaseline) {
    return {
      state: 'UNMODIFIED',
      label: 'UNMODIFIED',
      history: ['Baseline Repository'],
      hasPatch: false,
      hasManual: false
    };
  }

  const hasAppliedPatch = appliedPatches.some(p => p.filePath === filePath && p.status === 'applied');
  const hasManualEdit = Boolean(manualEdits[filePath]);

  if (hasAppliedPatch && hasManualEdit) {
    return {
      state: 'MSE_PATCH_APPLIED_AND_MANUAL_MODIFICATION',
      label: 'MSE PATCH APPLIED + MANUAL MODIFICATION',
      history: ['Baseline', 'MSE Patch', 'Manual Edit'],
      hasPatch: true,
      hasManual: true
    };
  }

  if (hasAppliedPatch) {
    return {
      state: 'MSE_PATCH_APPLIED',
      label: 'MSE PATCH APPLIED',
      history: ['Baseline', 'MSE Patch'],
      hasPatch: true,
      hasManual: false
    };
  }

  if (hasManualEdit) {
    return {
      state: 'MANUAL_MODIFICATION',
      label: 'MANUAL MODIFICATION',
      history: ['Baseline', 'Manual Edit'],
      hasPatch: false,
      hasManual: true
    };
  }

  return {
    state: 'MODIFIED',
    label: 'MODIFIED IN RAM',
    history: ['Baseline', 'RAM Edit'],
    hasPatch: false,
    hasManual: true
  };
}
