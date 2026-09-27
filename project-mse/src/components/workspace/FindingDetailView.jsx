import React, { useState } from 'react';
import { parseUnifiedDiff } from '../../utils/diffUtils';
import EvidenceChainView from './EvidenceChainView';
import BlastRadiusView from './BlastRadiusView';
import { computeFindingCapabilities } from '../../engine/capabilities.js';

export default function FindingDetailView({
  finding,
  onBack,
  onJumpToSource,
  onViewPatch,
  onApplyPatch,
  onRevertPatch,
  onVerifyFix,
  onNavigateTab,
  verification,
  decision,
  capabilities: _capabilities,
  isWorkingRevisionVerified = false,
  workingRevisionId,
  testedRevisionId
}) {
  const [showFullTest, setShowFullTest] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (!finding) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 font-sans">
        <p className="text-xs">No finding selected.</p>
        <button onClick={onBack} className="mt-2 text-xs text-[#38bdf8] hover:underline">
          &larr; Back to Findings
        </button>
      </div>
    );
  }

  const patch = finding.patch;
  const counterexample = finding.counterexample;
  const isRepaired = Boolean(finding.isRepaired);
  const patchApplied = Boolean(finding.patchApplied);
  const isModified = Boolean(finding.isModified);
  const isCritical = finding.severity === 'CRITICAL';
  const isHigh = finding.severity === 'HIGH';

  const diffChunks = patch?.diff ? parseUnifiedDiff(patch.diff) : [];

  // Verification Gate Model with MSE Exact Checks
  const gateDecision = decision?.status || verification?.status || 'PENDING';
  const gateChecks = decision?.checks || verification?.checks || [];

  const findingCaps = finding.capabilities || computeFindingCapabilities(
    finding,
    isRepaired,
    true,
    decision || verification
  );

  return (
    <div className="flex-1 flex flex-col font-sans bg-[#090d16] text-slate-200 overflow-hidden">
      {/* Top Header & Navigation */}
      <div className="p-4 border-b border-[#263147] bg-[#0d131f] space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-xs text-slate-400 hover:text-white transition flex items-center space-x-1"
          >
            <span>&larr;</span>
            <span>Back to Findings</span>
          </button>

          {/* Action Bar (Requirement 5) */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onJumpToSource(finding.file, finding.line, finding, 'view')}
              className="px-3 py-1.5 rounded-md bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs font-medium transition"
            >
              View Source
            </button>

            {patch && (
              <button
                onClick={() => onViewPatch(finding.file)}
                className="px-3 py-1.5 rounded-md bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs font-medium transition"
              >
                View Diff
              </button>
            )}

            <button
              onClick={onVerifyFix}
              className="px-3 py-1.5 rounded-md bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-[#38bdf8] text-xs font-bold transition flex items-center space-x-1"
            >
              <span>Test Changes</span>
            </button>

            {patch && !patchApplied && (
              <button
                onClick={() => onApplyPatch(patch)}
                className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition flex items-center space-x-1"
              >
                <span>Apply Patch</span>
              </button>
            )}

            {patch && patchApplied && onRevertPatch && (
              <button
                onClick={() => onRevertPatch(patch)}
                className="px-3.5 py-1.5 rounded-md bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-300 font-bold text-xs transition"
              >
                Revert Patch
              </button>
            )}

            <button
              onClick={() => onJumpToSource(finding.file, finding.line, finding, 'edit')}
              className="px-2.5 py-1.5 rounded-md bg-[#111724] hover:bg-[#1e293b] border border-slate-700 text-slate-400 text-xs font-medium transition"
              title="Open source editor"
            >
              Edit Source
            </button>
          </div>
        </div>

        {/* Title, Badges & Location */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
              isRepaired
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : finding.isTesting
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : finding.verificationStatus === 'FAILED'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : finding.verificationStatus === 'NEEDS_REVIEW'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : patchApplied
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : isModified
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : isCritical
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : isHigh
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-blue-500/20 text-[#38bdf8] border border-blue-500/30'
            }`}>
              {isRepaired
                ? 'VERIFIED'
                : finding.isTesting
                ? 'TESTING'
                : finding.verificationStatus === 'FAILED'
                ? 'FAILED'
                : patchApplied
                ? 'APPLIED IN RAM'
                : isModified
                ? 'MODIFIED'
                : finding.severity}
            </span>

            <span className="text-[10px] px-2 py-0.5 rounded bg-[#111724] text-slate-400 border border-[#263147] font-medium">
              {finding.category}
            </span>

            <span className="text-xs font-mono text-slate-400">
              {finding.file}:{finding.line}
            </span>
          </div>

          <h1 className="text-lg font-bold text-white">
            {finding.title}
          </h1>
        </div>
      </div>

      {/* Main Narrative Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">
        {/* CAPABILITY PIPELINE COVERAGE */}
        <section className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" />
              <span>Finding Capability Coverage</span>
            </h2>
            <span className="text-[10px] text-slate-400 font-mono">
              FIND • EXPLAIN • REPAIR &amp; VERIFY
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* 1. FIND STAGE */}
            <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-[#38bdf8]">1. FIND</span>
                <span className="text-[10px] text-emerald-400 font-bold">✓ DETECTED</span>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>AST Risk Pattern Identified</span>
                </div>
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Severity: <strong className="text-white">{finding.severity}</strong></span>
                </div>
              </div>
            </div>

            {/* 2. EXPLAIN STAGE */}
            <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-amber-400">2. EXPLAIN</span>
                <span className="text-[10px] text-emerald-400 font-bold">✓ TRACED</span>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <span className={findingCaps.explain.hasSourceEvidence ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {findingCaps.explain.hasSourceEvidence ? '✓' : '○'}
                  </span>
                  <span>Source Evidence: {findingCaps.explain.hasSourceEvidence ? `${finding.file}:${finding.line}` : 'None'}</span>
                </div>
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <span className={findingCaps.explain.hasInvariant ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {findingCaps.explain.hasInvariant ? '✓' : '○'}
                  </span>
                  <span>Invariant: {findingCaps.explain.hasInvariant ? (finding.invariant?.id || 'Defined') : 'Implicit AST Invariant'}</span>
                </div>
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <span className={findingCaps.explain.hasCounterexample ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {findingCaps.explain.hasCounterexample ? '✓' : '○'}
                  </span>
                  <span>Counterexample: {findingCaps.explain.hasCounterexample ? 'Scenario Reproduced' : 'Static Pattern'}</span>
                </div>
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <span className={findingCaps.explain.hasBlastRadius ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {findingCaps.explain.hasBlastRadius ? '✓' : '○'}
                  </span>
                  <span>Blast Radius: {findingCaps.explain.hasBlastRadius ? `${finding.blastRadius?.dependents?.length || 0} downstream files` : 'Single file scope'}</span>
                </div>
              </div>
            </div>

            {/* 3. REPAIR & VERIFY STAGE */}
            <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-emerald-400">3. REPAIR &amp; VERIFY</span>
                <span className={`text-[10px] font-bold ${
                  findingCaps.repairVerify.isVerified
                    ? 'text-emerald-400'
                    : finding.verificationStatus === 'FAILED'
                    ? 'text-red-400'
                    : patchApplied
                    ? 'text-blue-400'
                    : 'text-amber-400'
                }`}>
                  {findingCaps.repairVerify.isVerified
                    ? '✓ VERIFIED'
                    : finding.verificationStatus === 'FAILED'
                    ? '✗ FAILED'
                    : patchApplied
                    ? 'APPLIED IN RAM'
                    : 'REPAIR READY'}
                </span>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <span className={findingCaps.repairVerify.hasMsePatch ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {findingCaps.repairVerify.hasMsePatch ? '✓' : '○'}
                  </span>
                  <span>MSE Patch: {findingCaps.repairVerify.hasMsePatch ? 'Synthesized in RAM' : 'Manual Edit'}</span>
                </div>
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>In-Memory Source Editor</span>
                </div>
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <span className={gateDecision === 'VERIFIED' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {gateDecision === 'VERIFIED' ? '✓' : '○'}
                  </span>
                  <span>Verification: {gateDecision}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST & EXPLAINABILITY MATRIX */}
        <section className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" />
              <span>What MSE found</span>
            </h2>
            <span className="text-[10px] text-slate-400 bg-[#111724] border border-[#263147] px-2 py-0.5 rounded font-mono">
              Evidence summary
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* WHAT */}
            <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#38bdf8] block">What is the issue?</span>
              <p className="text-slate-200 leading-snug">{finding.title}</p>
            </div>

            {/* WHY */}
            <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">Why did MSE flag this?</span>
              <p className="text-slate-200 leading-snug">{finding.whyFlagged}</p>
            </div>

            {/* WHERE */}
            <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Where is the violation?</span>
              <p className="text-slate-300 font-mono text-[11px] leading-snug">
                {finding.file}:{finding.line}
              </p>
            </div>

            {/* WHAT COULD BREAK */}
            <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block">What could break? (Blast Radius)</span>
              <p className="text-slate-200 leading-snug">
                {finding.blastRadius?.isAvailable 
                  ? `${finding.blastRadius.dependents.length} caller(s), ${finding.blastRadius.dependencies.length} dependency(ies), ${finding.blastRadius.affectedTests.length} test suite(s)`
                  : 'Impact graph unavailable for this finding.'}
              </p>
            </div>

            {/* WHAT MSE CHANGED */}
            <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">What did MSE propose / change?</span>
              <p className="text-slate-200 leading-snug">
                {patch ? `${patch.strategy}: ${patch.description}` : 'No candidate repair required.'}
              </p>
            </div>

            {/* HOW VERIFIED */}
            <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 block">How was it verified?</span>
              <p className="text-slate-200 leading-snug">
                {gateDecision === 'VERIFIED'
                  ? 'Verified against MSE checks.'
                  : gateDecision === 'REJECTED'
                    ? 'A required MSE check failed.'
                    : 'Verification requires review.'}
              </p>
            </div>
          </div>
        </section>

        {/* MECHANISM 1: EVIDENCE CHAIN */}
        {finding.evidenceChain && (
          <EvidenceChainView
            evidenceChain={finding.evidenceChain}
            verification={decision || verification}
            onViewSource={() => onJumpToSource(finding.file, finding.line)}
            onViewPatch={onViewPatch}
            onApplyPatch={onApplyPatch}
          />
        )}

        {/* MECHANISM 2: WHY DID MSE FLAG THIS? */}
        <section className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" />
              <span>Why MSE flagged it</span>
          </h2>
          <div className="text-sm text-slate-200 leading-relaxed font-sans bg-[#111724] border border-[#1e293b] p-3.5 rounded">
            <p className="font-medium text-white">{finding.whyFlagged}</p>
          </div>

          {finding.invariant && (
            <div className="text-xs text-slate-400 border-t border-[#1e293b] pt-2 space-y-1">
              <div>
                <strong className="text-slate-300">Contract Invariant: </strong>
                <code className="text-[#38bdf8] font-mono">{finding.invariant.id} ({finding.invariant.name})</code>
              </div>
              <p>{finding.invariant.rationale}</p>
            </div>
          )}
        </section>

        {/* MECHANISM 3: IMPACT / BLAST RADIUS */}
        <BlastRadiusView
          blastRadius={finding.blastRadius}
          onJumpToFile={(filePath, line) => onJumpToSource(filePath, line)}
        />

        {/* NARRATIVE SECTION: EVIDENCE */}
        <section className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>Evidence</span>
          </h2>

          {/* Source Evidence */}
          {finding.sourceEvidence?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs text-slate-400">Source Code Reality:</span>
              {finding.sourceEvidence.map((ev, i) => (
                <div key={i} className="bg-[#060910] border border-[#1e293b] rounded p-3 font-mono text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] pb-1 border-b border-[#162032]">
                    <span>{ev.file}:{ev.line}</span>
                    <span>{ev.context}</span>
                  </div>
                  <pre className="text-amber-300 whitespace-pre-wrap">{ev.excerpt}</pre>
                </div>
              ))}
            </div>
          )}

          {/* Documentation Evidence if drift */}
          {finding.documentationEvidence?.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <span className="text-xs text-slate-400">Documentation Claim:</span>
              {finding.documentationEvidence.map((ev, i) => (
                <div key={i} className="bg-[#060910] border border-[#1e293b] rounded p-3 font-mono text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500 text-[11px] pb-1 border-b border-[#162032]">
                    <span>{ev.file}:{ev.line}</span>
                    <span>{ev.context}</span>
                  </div>
                  <pre className="text-blue-300 whitespace-pre-wrap">{ev.excerpt}</pre>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* MECHANISM 4: STRUCTURED COUNTEREXAMPLE (GAMMA) */}
        {counterexample && (
          <section id="counterexample-section" className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                <span>Counterexample</span>
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 font-mono">
                {counterexample.id}
              </span>
            </div>

            {/* Problem / Trigger / Path / Violation Grid */}
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1">
                <span className="text-red-400 font-bold block">1. Problem &amp; Trigger:</span>
                <p className="text-slate-200">{counterexample.trigger}</p>
              </div>

              {counterexample.executionPath && (
                <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1">
                  <span className="text-amber-400 font-bold block">2. Execution Propagation Path:</span>
                  <div className="flex items-center space-x-2 font-mono text-[11px] text-slate-300 overflow-x-auto py-1">
                    {counterexample.executionPath.map((node, i) => (
                      <React.Fragment key={i}>
                        <span className="px-2 py-0.5 rounded bg-[#090d16] border border-[#263147] whitespace-nowrap">{node}</span>
                        {i < counterexample.executionPath.length - 1 && <span className="text-slate-600">&rarr;</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1">
                  <span className="text-emerald-400 font-bold block">3. Expected Behavior:</span>
                  <p className="text-slate-300 text-[11px]">{counterexample.expectedBehavior}</p>
                </div>
                <div className="p-3 bg-[#111724] border border-[#1e293b] rounded space-y-1">
                  <span className="text-red-400 font-bold block">4. Observed Violation:</span>
                  <p className="text-slate-300 text-[11px]">{counterexample.observedViolation}</p>
                </div>
              </div>
            </div>

            {/* Generated Vitest Regression Test */}
            {counterexample.testCode && (
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Synthesized Vitest Regression Test Artifact:</span>
                  <button
                    onClick={() => setShowFullTest(!showFullTest)}
                    className="text-xs text-[#38bdf8] hover:underline"
                  >
                    {showFullTest ? 'Collapse Test' : 'Expand Full Test Code'}
                  </button>
                </div>

                <div className="bg-[#060910] border border-[#1e293b] rounded p-3 font-mono text-xs overflow-x-auto max-h-56">
                  <pre className="text-slate-300 leading-relaxed">
                    {showFullTest 
                      ? counterexample.testCode 
                      : counterexample.testCode.slice(0, 320) + '\n  // ... (click Expand to view full executable test)'}
                  </pre>
                </div>
              </div>
            )}
          </section>
        )}

        {/* REQUIREMENT 5: IMMEDIATELY SHOW WHAT CHANGED (PATCH APPLIED) */}
        {patch && patchApplied && (
          <section className="bg-emerald-950/20 border border-emerald-500/40 rounded-lg p-5 space-y-4 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  PATCH APPLIED
                </h2>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                isRepaired
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {isRepaired ? 'VERIFIED — RESOLVED' : 'MODIFIED — NOT VERIFIED'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-[#090d16]/70 p-3 rounded border border-[#1e293b]">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">File:</span>
                <span className="font-mono text-slate-200">{patch.targetFile}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Source:</span>
                <span className="text-emerald-400 font-semibold">MSE generated repair</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">State:</span>
                <span className={`font-bold ${isRepaired ? 'text-emerald-400' : 'text-amber-300'}`}>
                  {isRepaired ? 'VERIFIED — RESOLVED' : 'MODIFIED — NOT VERIFIED'}
                </span>
              </div>
            </div>

            {/* Actions: [ View Source ] [ View Diff ] [ Test Changes ] [ Revert Patch ] */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#1e293b]">
              <button
                onClick={() => onJumpToSource(patch.targetFile, finding.line, finding, 'view')}
                className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs font-medium transition"
              >
                View Source
              </button>
              <button
                onClick={() => onViewPatch(patch.targetFile)}
                className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs font-medium transition"
              >
                View Diff
              </button>
              <button
                onClick={onVerifyFix}
                className="px-3 py-1.5 rounded bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-[#38bdf8] text-xs font-bold transition flex items-center space-x-1"
              >
                <span>Test Changes</span>
              </button>
              {onRevertPatch && (
                <button
                  onClick={() => onRevertPatch(patch)}
                  className="px-3 py-1.5 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-300 text-xs font-bold transition"
                >
                  Revert Patch
                </button>
              )}
            </div>

            {/* Unified Diff Preview of Applied Patch */}
            <div className="bg-[#060910] border border-[#1e293b] rounded font-mono text-xs overflow-x-auto max-h-64 mt-3">
              <div className="p-2 border-b border-[#162032] text-slate-500 text-[11px] flex items-center justify-between">
                <span>{patch.targetFile} (working snapshot)</span>
                <span>Unified Diff</span>
              </div>
              <div className="p-3 space-y-0.5">
                {diffChunks.map((chunk, cIdx) => (
                  <div key={cIdx} className="space-y-0.5">
                    <div className="text-slate-500 text-[11px] py-0.5 select-none">{chunk.header}</div>
                    {chunk.lines.map((line, lIdx) => (
                      <div
                        key={lIdx}
                        className={`px-1.5 py-0.2 rounded-sm ${
                          line.type === 'add'
                            ? 'bg-emerald-950/60 text-emerald-300'
                            : line.type === 'del'
                            ? 'bg-red-950/60 text-red-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {line.raw}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* NARRATIVE SECTION: PROPOSED CHANGE (WHEN NOT APPLIED) */}
        {patch && !patchApplied && (
          <section className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Proposed change</span>
              </h2>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                  {patch.strategy}
                </span>
                <button
                  onClick={() => onApplyPatch(patch)}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                >
                  Apply Patch in RAM
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-300">{patch.description}</p>

            {/* Unified Diff Preview */}
            <div className="bg-[#060910] border border-[#1e293b] rounded font-mono text-xs overflow-x-auto max-h-64">
              <div className="p-2 border-b border-[#162032] text-slate-500 text-[11px] flex items-center justify-between">
                <span>{patch.targetFile}</span>
                <span>Unified Diff</span>
              </div>
              <div className="p-3 space-y-0.5">
                {diffChunks.map((chunk, cIdx) => (
                  <div key={cIdx} className="space-y-0.5">
                    <div className="text-slate-500 text-[11px] py-0.5 select-none">{chunk.header}</div>
                    {chunk.lines.map((line, lIdx) => (
                      <div
                        key={lIdx}
                        className={`px-1.5 py-0.2 rounded-sm ${
                          line.type === 'add'
                            ? 'bg-emerald-950/60 text-emerald-300'
                            : line.type === 'del'
                            ? 'bg-red-950/60 text-red-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {line.raw}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* MECHANISM 6: VERIFICATION GATE */}
        <section className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
              <span>Verification</span>
            </h2>
            <span className={`text-xs px-2.5 py-1 rounded font-bold font-mono ${
              gateDecision === 'VERIFIED'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              {gateDecision === 'VERIFIED' ? 'PASS' : gateDecision === 'FAILED' || gateDecision === 'REJECTED' ? 'FAIL' : 'REVIEW NEEDED'}
            </span>
          </div>

          <div className="p-3.5 bg-[#111724] border border-[#1e293b] rounded space-y-3 text-xs">
            <div className="text-slate-300">
              {gateDecision === 'VERIFIED'
                ? 'All verification checks passed.'
                : 'Review the checks below after applying the proposed change.'}
            </div>

            {/* Checklist */}
            <div className="space-y-1.5 pt-2 border-t border-[#1e293b]">
              {gateChecks.map((check, idx) => (
                <div key={idx} className="flex items-center space-x-2 text-[11px]">
                  <span className={check.status === 'passed' ? 'text-emerald-400 font-bold' : check.status === 'skipped' ? 'text-slate-500' : 'text-red-400'}>
                    {check.status === 'passed' ? '✓' : check.status === 'skipped' ? '○' : '✗'}
                  </span>
                  <span className={check.status === 'passed' ? 'text-slate-200' : 'text-slate-400'}>
                    {check.name}: {String(check.status || 'skipped').toUpperCase()}
                  </span>
                </div>
              ))}
            </div>

            {onNavigateTab && (
              <div className="pt-3 border-t border-[#1e293b]">
                <button
                  onClick={() => onNavigateTab('report')}
                  className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-purple-300 font-medium text-xs transition"
                >
                  View report
                </button>
              </div>
            )}
          </div>
        </section>

        {/* PROGRESSIVE DISCLOSURE: DEEP TECHNICAL DETAILS */}
        <section className="bg-[#0d131f] border border-[#263147] rounded-lg overflow-hidden">
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-[#111724] transition text-xs font-bold uppercase tracking-wider text-slate-300"
          >
            <div className="flex items-center space-x-2">
              <span className="text-[#38bdf8]">🔬</span>
              <span>Technical Analysis Details (Alpha / Beta / Gamma AST &amp; Invariants)</span>
            </div>
            <span className="text-slate-500 font-mono text-[11px]">
              {showTechnicalDetails ? '▲ Hide Advanced Details' : '▼ Expand Advanced Details'}
            </span>
          </button>

          {showTechnicalDetails && (
            <div className="p-5 pt-2 space-y-4 border-t border-[#1e293b] text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded bg-[#060910] border border-[#1e293b] space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#38bdf8] block">Subagent Alpha</span>
                  <div className="text-slate-300 font-mono text-[11px]">AST Parser &amp; Graph</div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Identified state mutation site without auth guard in handler chain.
                  </p>
                </div>
                <div className="p-3 rounded bg-[#060910] border border-[#1e293b] space-y-1">
                  <span className="text-[10px] uppercase font-bold text-amber-400 block">Subagent Beta</span>
                  <div className="text-slate-300 font-mono text-[11px]">Symbiote Spec Drift</div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Extracted declarative documentation claims and measured intent divergence.
                  </p>
                </div>
                <div className="p-3 rounded bg-[#060910] border border-[#1e293b] space-y-1">
                  <span className="text-[10px] uppercase font-bold text-red-400 block">Subagent Gamma</span>
                  <div className="text-slate-300 font-mono text-[11px]">Immune CEGIS Engine</div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Synthesized counterexample and inductive candidate patch diff.
                  </p>
                </div>
              </div>

              {finding.invariant && (
                <div className="p-3 rounded bg-[#060910] border border-[#1e293b] space-y-1.5 font-mono text-[11px]">
                  <div className="text-slate-400 uppercase text-[10px] font-bold">Formal Invariant Contract:</div>
                  <div className="text-emerald-400">{finding.invariant.id}: {finding.invariant.name}</div>
                  <div className="text-slate-300">{finding.invariant.rationale}</div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
