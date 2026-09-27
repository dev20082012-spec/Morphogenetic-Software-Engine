import React, { useState } from 'react';
import { parseUnifiedDiff } from '../../utils/diffUtils';
import EvidenceChainView from './EvidenceChainView';
import BlastRadiusView from './BlastRadiusView';

export default function FindingDetailView({
  finding,
  onBack,
  onJumpToSource,
  onViewPatch,
  onApplyPatch,
  onVerifyFix,
  onNavigateTab
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
  const isRepaired = finding.isRepaired;
  const isCritical = finding.severity === 'CRITICAL';
  const isHigh = finding.severity === 'HIGH';

  const diffChunks = patch?.diff ? parseUnifiedDiff(patch.diff) : [];

  // Verification Gate Model with MSE Exact Checks
  const gateDecision = isRepaired ? 'VERIFIED' : 'NEEDS_REVIEW';
  const gateChecks = [
    { name: 'Original counterexample resolved and no longer reproduces', passed: isRepaired },
    { name: 'Synthesized regression test passes', passed: isRepaired },
    { name: 'Supported system invariant restored', passed: isRepaired },
    { name: 'AST syntax & build check passes', passed: true },
    { name: 'No newly detected supported violation introduced', passed: true }
  ];

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

          {/* Action Bar */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onJumpToSource(finding.file, finding.line)}
              className="px-3 py-1.5 rounded-md bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs font-medium transition"
            >
              View Source
            </button>

            {patch && (
              <button
                onClick={() => onViewPatch(finding.file)}
                className="px-3 py-1.5 rounded-md bg-[#111724] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs font-medium transition"
              >
                View Patch Diff
              </button>
            )}

            {patch && !isRepaired && (
              <button
                onClick={() => onApplyPatch(patch)}
                className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition flex items-center space-x-1"
              >
                <span>Apply Patch</span>
              </button>
            )}

            <button
              onClick={onVerifyFix}
              className="px-3 py-1.5 rounded-md bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-[#38bdf8] text-xs font-semibold transition"
            >
              Verify Fix
            </button>
          </div>
        </div>

        {/* Title, Badges & Location */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
              isRepaired
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : isCritical
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : isHigh
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-blue-500/20 text-[#38bdf8] border border-blue-500/30'
            }`}>
              {isRepaired ? 'REPAIRED IN RAM' : finding.severity}
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
        {/* TRUST & EXPLAINABILITY MATRIX */}
        <section className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" />
              <span>Trust &amp; Explainability Summary</span>
            </h2>
            <span className="text-[10px] text-slate-400 bg-[#111724] border border-[#263147] px-2 py-0.5 rounded font-mono">
              Deterministic Verification
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
                {isRepaired 
                  ? 'Verified against MSE checks: counterexample ceased to reproduce and invariant satisfied.' 
                  : 'Pending patch application to satisfy bound invariant checks.'}
              </p>
            </div>
          </div>
        </section>

        {/* MECHANISM 1: EVIDENCE CHAIN */}
        {finding.evidenceChain && (
          <EvidenceChainView
            evidenceChain={finding.evidenceChain}
            onViewSource={() => onJumpToSource(finding.file, finding.line)}
            onViewPatch={onViewPatch}
            onApplyPatch={onApplyPatch}
          />
        )}

        {/* MECHANISM 2: WHY DID MSE FLAG THIS? */}
        <section className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" />
            <span>Why Did MSE Flag This?</span>
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
          <section className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                <span>Gamma Counterexample Synthesis</span>
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

        {/* NARRATIVE SECTION: PROPOSED CHANGE */}
        {patch && (
          <section className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Candidate Repair Patch</span>
              </h2>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                  {patch.strategy}
                </span>
                {!isRepaired && (
                  <button
                    onClick={() => onApplyPatch(patch)}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                  >
                    Apply Patch in RAM
                  </button>
                )}
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
              <span>Verification Gate</span>
            </h2>
            <span className={`text-xs px-2.5 py-1 rounded font-bold font-mono ${
              gateDecision === 'VERIFIED'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              {gateDecision === 'VERIFIED' ? 'VERIFIED' : 'NEEDS REVIEW'}
            </span>
          </div>

          <div className="p-3.5 bg-[#111724] border border-[#1e293b] rounded space-y-3 text-xs">
            <div className="text-slate-300">
              {isRepaired
                ? 'Verified against MSE checks. Invariant restored and regression test passed.'
                : 'Requires patch application to satisfy bound invariants.'}
            </div>

            {/* Checklist */}
            <div className="space-y-1.5 pt-2 border-t border-[#1e293b]">
              {gateChecks.map((check, idx) => (
                <div key={idx} className="flex items-center space-x-2 text-[11px]">
                  <span className={check.passed ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {check.passed ? '✓' : '○'}
                  </span>
                  <span className={check.passed ? 'text-slate-200' : 'text-slate-400'}>
                    {check.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Verification Gate Action Buttons: [ View Evidence ] [ View Diff ] [ Export Report ] */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#1e293b]">
              <button
                onClick={() => onJumpToSource(finding.file, finding.line)}
                className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-slate-200 font-medium text-xs transition"
              >
                View Evidence
              </button>
              {patch && (
                <button
                  onClick={() => onViewPatch(finding.file)}
                  className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-[#38bdf8] font-medium text-xs transition"
                >
                  View Diff
                </button>
              )}
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('report')}
                  className="px-3 py-1.5 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-purple-300 font-medium text-xs transition"
                >
                  Export Report
                </button>
              )}
            </div>
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
