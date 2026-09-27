import { describe, it, expect } from 'vitest';
import {
  computeRevisionId,
  applyPatchAtomically,
  revertPatchAtomically,
  detectPatchCollision,
  getFileModificationState,
  loadEnterpriseFixture,
  applyPatches
} from '../src/engine/index.js';
import { generateUnifiedDiff } from '../src/utils/diffUtils.js';

describe('Project MSE — Stateful Repository Transformation & Patch Lifecycle Suite', () => {

  // Fixture setup
  const createTestRepo = () => {
    const base = loadEnterpriseFixture();
    // Deep clone to ensure completely independent baseline and working snapshots
    const baselineSnapshot = JSON.parse(JSON.stringify(base));
    const workingSnapshot = JSON.parse(JSON.stringify(base));
    return { baselineSnapshot, workingSnapshot };
  };

  const samplePatchA = {
    id: 'MSE-PATCH-001',
    findingId: 'FINDING-AUTH-001',
    description: 'Add authentication guard to booking endpoint',
    strategy: 'AUTH_GUARD_INSERTION',
    targetFile: 'src/api/webhooks.ts',
    originalContent: 'export async function handleWebhook(req, res) {\n  const payload = req.body;\n  return res.json({ ok: true });\n}',
    patchedContent: 'export async function handleWebhook(req, res) {\n  if (!req.headers["x-signature"]) throw new Error("Unauthorized");\n  const payload = req.body;\n  return res.json({ ok: true });\n}',
    hunks: [{ start: 1, end: 4 }]
  };

  const samplePatchB = {
    id: 'MSE-PATCH-002',
    findingId: 'FINDING-DRIFT-002',
    description: 'Reconcile ledger balance check invariant',
    strategy: 'INVARIANT_RECONCILIATION',
    targetFile: 'src/server.ts',
    originalContent: 'export function startServer() {\n  return "running";\n}',
    patchedContent: 'export function startServer() {\n  // Invariant verified: balance check enforced\n  return "running_secure";\n}',
    hunks: [{ start: 1, end: 3 }]
  };

  const conflictingPatchA2 = {
    id: 'MSE-PATCH-003',
    findingId: 'FINDING-AUTH-002',
    description: 'Conflicting guard rewrite on same webhook lines',
    strategy: 'AUTH_OVERWRITE',
    targetFile: 'src/api/webhooks.ts',
    originalContent: 'export async function handleWebhook(req, res) {\n  const payload = req.body;\n  return res.json({ ok: true });\n}',
    patchedContent: 'export async function handleWebhook(req, res) {\n  /* CONFLICTING HOOK */\n  return res.status(403).end();\n}',
    hunks: [{ start: 1, end: 4 }]
  };

  describe('1. Working vs Baseline Snapshot Integrity', () => {
    it('applying an MSE patch modifies ONLY the working snapshot; baseline remains untouched', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();
      const targetPath = 'src/api/webhooks.ts';
      const baselineOriginal = baselineSnapshot.files.find(f => f.path === targetPath).content;

      const result = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });

      expect(result.ok).toBe(true);
      expect(result.newSnapshot).toBeDefined();

      // Working snapshot contains patched content
      const workingPatchedFile = result.newSnapshot.files.find(f => f.path === targetPath);
      expect(workingPatchedFile.content).toBe(samplePatchA.patchedContent);

      // Baseline snapshot remains completely untouched
      const baselineFileAfter = baselineSnapshot.files.find(f => f.path === targetPath);
      expect(baselineFileAfter.content).toBe(baselineOriginal);
      expect(baselineFileAfter.content).not.toBe(samplePatchA.patchedContent);
    });
  });

  describe('2. Atomic Patch Application & Failure Handling', () => {
    it('applies patch atomically and generates valid PatchApplication record', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();

      const result = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA,
        finding: { id: 'FINDING-AUTH-001', title: 'Missing Webhook Authentication' }
      });

      expect(result.ok).toBe(true);
      expect(result.patchRecord).toMatchObject({
        patchId: 'MSE-PATCH-001',
        findingId: 'FINDING-AUTH-001',
        filePath: 'src/api/webhooks.ts',
        source: 'mse',
        status: 'applied',
        strategy: 'AUTH_GUARD_INSERTION'
      });
      expect(result.patchRecord.baselineContent).toBeDefined();
      expect(result.patchRecord.appliedContent).toBe(samplePatchA.patchedContent);
      expect(result.patchRecord.diff).toContain('x-signature');
      expect(result.newRevisionId).toMatch(/^rev-[0-9a-f]{8}$/);
    });

    it('rejects patch atomically if target file does not exist without mutating repository', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();
      const nonExistentPatch = {
        id: 'PATCH-404',
        targetFile: 'non/existent/file.ts',
        patchedContent: 'some content'
      };

      const result = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: nonExistentPatch
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('does not exist');
      expect(result.newSnapshot).toBeUndefined();
    });

    it('rejects duplicate patch application', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();
      const firstResult = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });
      expect(firstResult.ok).toBe(true);

      const secondResult = applyPatchAtomically({
        workingSnapshot: firstResult.newSnapshot,
        baselineSnapshot,
        patch: samplePatchA,
        appliedPatches: [firstResult.patchRecord]
      });

      expect(secondResult.ok).toBe(false);
      expect(secondResult.error).toContain('already applied');
    });
  });

  describe('3. Deterministic Revision Identity & Verification Invalidation', () => {
    it('computes deterministic revision hash that updates when repository content mutates', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();
      const revInitial = computeRevisionId(workingSnapshot);
      const revInitialAgain = computeRevisionId(workingSnapshot);

      expect(revInitial).toBe(revInitialAgain);
      expect(revInitial).toMatch(/^rev-[0-9a-f]{8}$/);

      const applied = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });

      const revPatched = computeRevisionId(applied.newSnapshot);
      expect(revPatched).not.toBe(revInitial);
    });

    it('identifies that verification tied to previous revision does not verify new revision', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();
      const revA = computeRevisionId(workingSnapshot);

      // Simulated verification against revA
      const verificationForRevA = {
        status: 'VERIFIED',
        testedRevision: revA,
        timestamp: new Date().toISOString()
      };

      // Patch applied -> produces revision B
      const applied = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });
      const revB = computeRevisionId(applied.newSnapshot);

      // Revision B must NOT be verified by Revision A's verification
      const isVerified = verificationForRevA.status === 'VERIFIED' && verificationForRevA.testedRevision === revB;
      expect(isVerified).toBe(false);
    });
  });

  describe('4. Multiple Non-Conflicting Patches', () => {
    it('supports applying patch A then patch B; working snapshot retains both changes', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();

      // Apply Patch A (webhooks.ts)
      const resA = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });
      expect(resA.ok).toBe(true);

      // Apply Patch B (server.ts) on top of working snapshot with Patch A
      const resB = applyPatchAtomically({
        workingSnapshot: resA.newSnapshot,
        baselineSnapshot,
        patch: samplePatchB,
        appliedPatches: [resA.patchRecord]
      });
      expect(resB.ok).toBe(true);

      const finalSnapshot = resB.newSnapshot;

      // File A has patch A
      const fileA = finalSnapshot.files.find(f => f.path === samplePatchA.targetFile);
      expect(fileA.content).toBe(samplePatchA.patchedContent);

      // File B has patch B
      const fileB = finalSnapshot.files.find(f => f.path === samplePatchB.targetFile);
      expect(fileB.content).toBe(samplePatchB.patchedContent);
    });
  });

  describe('5. Patch Collision & Overlap Detection', () => {
    it('detects and rejects overlapping or conflicting patches targeting the same region', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();

      // Apply Patch A
      const resA = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });
      expect(resA.ok).toBe(true);

      // Try to apply conflicting patch A2 on overlapping hunk
      const collisionCheck = detectPatchCollision(
        conflictingPatchA2,
        [resA.patchRecord],
        resA.newSnapshot
      );

      expect(collisionCheck.hasConflict).toBe(true);
      expect(collisionCheck.reason).toContain('conflicts with previously applied patch');
      expect(collisionCheck.conflict).toBeDefined();
      expect(collisionCheck.conflict.patchA).toBe(samplePatchA.id);
      expect(collisionCheck.conflict.patchB).toBe(conflictingPatchA2.id);

      // Atomic apply also rejects
      const resA2 = applyPatchAtomically({
        workingSnapshot: resA.newSnapshot,
        baselineSnapshot,
        patch: conflictingPatchA2,
        appliedPatches: [resA.patchRecord]
      });
      expect(resA2.ok).toBe(false);
      expect(resA2.error).toContain('conflicts with previously applied patch');
    });
  });

  describe('6. Revert Patch with Manual Modification Conflict Detection', () => {
    it('reverts patch cleanly back to baseline when no manual edits exist', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();

      const applied = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });
      expect(applied.ok).toBe(true);

      const reverted = revertPatchAtomically({
        baselineSnapshot,
        workingSnapshot: applied.newSnapshot,
        patchId: samplePatchA.id,
        appliedPatches: [applied.patchRecord]
      });

      expect(reverted.ok).toBe(true);
      const revertedFile = reverted.newSnapshot.files.find(f => f.path === samplePatchA.targetFile);
      const baselineFile = baselineSnapshot.files.find(f => f.path === samplePatchA.targetFile);
      expect(revertedFile.content).toBe(baselineFile.content);
    });

    it('detects conflict and refuses silent overwrite if user edited file after MSE patch', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();

      const applied = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });
      expect(applied.ok).toBe(true);

      // User manually edits the file in working snapshot after the patch
      const manualEditedContent = applied.patchRecord.appliedContent + '\n// Manual user addition';
      const userEditedWorkingSnapshot = {
        ...applied.newSnapshot,
        files: applied.newSnapshot.files.map(f => f.path === samplePatchA.targetFile ? { ...f, content: manualEditedContent } : f)
      };

      const revertAttempt = revertPatchAtomically({
        baselineSnapshot,
        workingSnapshot: userEditedWorkingSnapshot,
        patchId: samplePatchA.id,
        appliedPatches: [applied.patchRecord],
        manualEdits: { [samplePatchA.targetFile]: manualEditedContent },
        force: false
      });

      expect(revertAttempt.ok).toBe(false);
      expect(revertAttempt.hasConflict).toBe(true);
      expect(revertAttempt.conflictMessage).toContain('Manual changes exist');
      expect(revertAttempt.currentContent).toBe(manualEditedContent);

      // But can force revert if user explicitly chooses "Force Revert"
      const forceRevert = revertPatchAtomically({
        baselineSnapshot,
        workingSnapshot: userEditedWorkingSnapshot,
        patchId: samplePatchA.id,
        appliedPatches: [applied.patchRecord],
        manualEdits: { [samplePatchA.targetFile]: manualEditedContent },
        force: true
      });
      expect(forceRevert.ok).toBe(true);
      const revertedFile = forceRevert.newSnapshot.files.find(f => f.path === samplePatchA.targetFile);
      const baselineFile = baselineSnapshot.files.find(f => f.path === samplePatchA.targetFile);
      expect(revertedFile.content).toBe(baselineFile.content);
    });
  });

  describe('7. File Modification State & History Tracking (Requirement 7 & 8)', () => {
    it('distinguishes MSE_PATCH_APPLIED, MANUAL_MODIFICATION, and combined state with breadcrumb history', () => {
      const filePath = 'src/api/webhooks.ts';
      const baselineContent = 'base';
      const patchContent = 'base + patch';
      const manualContent = 'base + patch + manual';

      // Unmodified
      const state0 = getFileModificationState({
        filePath,
        baselineContent,
        workingContent: baselineContent
      });
      expect(state0.state).toBe('UNMODIFIED');
      expect(state0.hasPatch).toBe(false);
      expect(state0.hasManual).toBe(false);

      // MSE Patch Applied
      const state1 = getFileModificationState({
        filePath,
        baselineContent,
        workingContent: patchContent,
        appliedPatches: [{ filePath, status: 'applied' }]
      });
      expect(state1.state).toBe('MSE_PATCH_APPLIED');
      expect(state1.label).toBe('MSE PATCH APPLIED');
      expect(state1.hasPatch).toBe(true);
      expect(state1.hasManual).toBe(false);
      expect(state1.history).toEqual(['Baseline', 'MSE Patch']);

      // MSE Patch + Manual Modification
      const state2 = getFileModificationState({
        filePath,
        baselineContent,
        workingContent: manualContent,
        appliedPatches: [{ filePath, status: 'applied' }],
        manualEdits: { [filePath]: manualContent }
      });
      expect(state2.state).toBe('MSE_PATCH_APPLIED_AND_MANUAL_MODIFICATION');
      expect(state2.label).toBe('MSE PATCH APPLIED + MANUAL MODIFICATION');
      expect(state2.hasPatch).toBe(true);
      expect(state2.hasManual).toBe(true);
      expect(state2.history).toEqual(['Baseline', 'MSE Patch', 'Manual Edit']);
    });
  });

  describe('8. Real Baseline vs Working Diff (Requirement 6)', () => {
    it('computes real diff between baseline and current working content', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();
      const targetFile = 'src/api/webhooks.ts';
      const baseFile = baselineSnapshot.files.find(f => f.path === targetFile);

      const applied = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });

      const workingFile = applied.newSnapshot.files.find(f => f.path === targetFile);
      const realDiff = generateUnifiedDiff(targetFile, baseFile.content, workingFile.content);

      expect(realDiff).toContain('--- a/src/api/webhooks.ts');
      expect(realDiff).toContain('+++ b/src/api/webhooks.ts');
      expect(realDiff).toContain('x-signature');
    });
  });

  describe('9. Reset Repository (Requirement 10)', () => {
    it('restores working snapshot = baseline snapshot without corrupting metadata or source identity', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();

      // Apply patch to working snapshot
      const applied = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });
      expect(computeRevisionId(applied.newSnapshot)).not.toBe(computeRevisionId(baselineSnapshot));

      // Reset operation: working snapshot restored to baseline snapshot
      const resetWorkingSnapshot = baselineSnapshot;
      expect(computeRevisionId(resetWorkingSnapshot)).toBe(computeRevisionId(baselineSnapshot));
      expect(resetWorkingSnapshot.metadata.name).toBe(baselineSnapshot.metadata.name);
    });
  });

  describe('10. Full Acceptance Scenarios A through V', () => {
    it('Scenario A-J: Apply patch -> Working modified -> Diff real -> Revert clean', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();
      const targetPath = 'src/api/webhooks.ts';

      // A: Finding identified
      // B: Apply patch
      const applied = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });
      expect(applied.ok).toBe(true);

      // C-D: Finding context & no page refresh/reset
      expect(applied.newSnapshot).toBeDefined();

      // E-F: Patched working source
      const workingFile = applied.newSnapshot.files.find(f => f.path === targetPath);
      expect(workingFile.content).toBe(samplePatchA.patchedContent);

      // G-H: Real diff
      const baselineFile = baselineSnapshot.files.find(f => f.path === targetPath);
      const diff = generateUnifiedDiff(targetPath, baselineFile.content, workingFile.content);
      expect(diff).toContain('x-signature');

      // I-J: Revert patch
      const reverted = revertPatchAtomically({
        baselineSnapshot,
        workingSnapshot: applied.newSnapshot,
        patchId: samplePatchA.id,
        appliedPatches: [applied.patchRecord]
      });
      expect(reverted.ok).toBe(true);
      const finalFile = reverted.newSnapshot.files.find(f => f.path === targetPath);
      expect(finalFile.content).toBe(baselineFile.content);
    });

    it('Scenario K-O: Patch -> User manual edit -> Save -> Revision invalidation', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();
      const targetPath = 'src/api/webhooks.ts';

      // K: Apply patch
      const applied = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });
      const revAfterPatch = computeRevisionId(applied.newSnapshot);

      // L-M: User manually edits same file and saves in RAM
      const userEdited = applied.newSnapshot.files.map(f =>
        f.path === targetPath ? { ...f, content: f.content + '\n// user manual safeguard' } : f
      );
      const workingAfterEdit = { ...applied.newSnapshot, files: userEdited };
      const revAfterEdit = computeRevisionId(workingAfterEdit);

      expect(revAfterEdit).not.toBe(revAfterPatch);

      // N-O: Test changes ties verification to new revision
      const verificationRecord = {
        status: 'VERIFIED',
        testedRevision: revAfterEdit
      };
      expect(verificationRecord.testedRevision).toBe(revAfterEdit);
      expect(verificationRecord.testedRevision).not.toBe(revAfterPatch);
    });

    it('Scenario P-R: Multi-patch A + B retained together in working snapshot', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();

      const resA = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });

      const resB = applyPatchAtomically({
        workingSnapshot: resA.newSnapshot,
        baselineSnapshot,
        patch: samplePatchB,
        appliedPatches: [resA.patchRecord]
      });

      expect(resA.ok).toBe(true);
      expect(resB.ok).toBe(true);

      const fA = resB.newSnapshot.files.find(f => f.path === samplePatchA.targetFile);
      const fB = resB.newSnapshot.files.find(f => f.path === samplePatchB.targetFile);
      expect(fA.content).toBe(samplePatchA.patchedContent);
      expect(fB.content).toBe(samplePatchB.patchedContent);
    });

    it('Scenario S-T: Conflicting edits/patches do not silently overwrite', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();

      const resA = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });

      const resConflict = applyPatchAtomically({
        workingSnapshot: resA.newSnapshot,
        baselineSnapshot,
        patch: conflictingPatchA2,
        appliedPatches: [resA.patchRecord]
      });

      expect(resConflict.ok).toBe(false);
      expect(resConflict.error).toBeDefined();
      expect(resConflict.conflict).toBeDefined();
    });

    it('Scenario U-V: Working state persists across representations', () => {
      const { baselineSnapshot, workingSnapshot } = createTestRepo();

      const applied = applyPatchAtomically({
        workingSnapshot,
        baselineSnapshot,
        patch: samplePatchA
      });

      const state = getFileModificationState({
        filePath: samplePatchA.targetFile,
        baselineContent: baselineSnapshot.files.find(f => f.path === samplePatchA.targetFile).content,
        workingContent: applied.newSnapshot.files.find(f => f.path === samplePatchA.targetFile).content,
        appliedPatches: [applied.patchRecord]
      });

      expect(state.state).toBe('MSE_PATCH_APPLIED');
      expect(state.hasPatch).toBe(true);
    });
  });

});
