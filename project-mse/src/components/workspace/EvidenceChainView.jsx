import React, { useState } from 'react';

export default function EvidenceChainView({
  evidenceChain,
  onViewSource,
  onViewPatch,
  onApplyPatch,
  verification: pipelineVerification
}) {
  const [activeStage, setActiveStage] = useState('finding');

  if (!evidenceChain) return null;

  const {
    findingId,
    title,
    sourceEvidence = [],
    documentationEvidence = [],
    invariant,
    counterexample,
    patch,
    verification
  } = evidenceChain;
  const displayedVerification = pipelineVerification || verification;

  const stages = [
    { id: 'finding', label: '1. Finding', desc: findingId, isReady: true },
    { id: 'evidence', label: '2. Evidence', desc: `${sourceEvidence.length + documentationEvidence.length} items`, isReady: sourceEvidence.length > 0 || documentationEvidence.length > 0 },
    { id: 'invariant', label: '3. Invariant', desc: invariant ? invariant.id : 'Spec Contract', isReady: Boolean(invariant) },
    { id: 'counterexample', label: '4. Counterexample', desc: counterexample ? counterexample.id : 'N/A', isReady: Boolean(counterexample) },
    { id: 'patch', label: '5. Patch', desc: patch ? patch.strategy : 'Synthesized', isReady: Boolean(patch) },
    { id: 'verification', label: '6. Verification', desc: displayedVerification?.status || 'Pending', isReady: Boolean(displayedVerification) }
  ];

  return (
    <div className="bg-[#0d131f] border border-[#263147] rounded-lg p-5 space-y-4 font-sans text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" />
            <span>Finding Evidence Chain</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            End-to-end provenance connecting empirical code evidence to verification gate.
          </p>
        </div>

        <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-[#162032] text-[#38bdf8] border border-[#24334d]">
          Deterministic Pipeline
        </span>
      </div>

      {/* Visual Chain Progression Track */}
      <div className="flex items-center justify-between overflow-x-auto py-2 gap-1 border-y border-[#1e293b]">
        {stages.map((stage, idx) => {
          const isSelected = activeStage === stage.id;
          return (
            <React.Fragment key={stage.id}>
              <button
                onClick={() => setActiveStage(stage.id)}
                className={`px-2.5 py-1.5 rounded-md border text-left transition shrink-0 ${
                  isSelected
                    ? 'bg-[#1e293b] border-[#38bdf8] text-white shadow-sm'
                    : stage.isReady
                    ? 'bg-[#111724] border-[#263147] text-slate-300 hover:border-slate-500'
                    : 'bg-[#0a0e17] border-transparent text-slate-600'
                }`}
              >
                <div className="text-[10px] font-bold">{stage.label}</div>
                <div className="text-[9px] font-mono text-slate-400 truncate max-w-[90px]">{stage.desc}</div>
              </button>

              {idx < stages.length - 1 && (
                <span className="text-slate-600 select-none text-[10px] shrink-0">&rarr;</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Active Stage Inspector Panel */}
      <div className="bg-[#060910] border border-[#1e293b] rounded p-4 text-xs font-mono">
        {activeStage === 'finding' && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-[#38bdf8] font-bold">FINDING:</span>
              <span className="text-white font-semibold">{title}</span>
            </div>
            <div className="text-slate-400 text-[11px]">ID: {findingId}</div>
          </div>
        )}

        {activeStage === 'evidence' && (
          <div className="space-y-2">
            <span className="text-amber-400 font-bold block">EMPIRICAL EVIDENCE:</span>
            {sourceEvidence.map((ev, i) => (
              <div key={i} className="text-slate-300 text-[11px]">
                • Source: <code className="text-amber-300">{ev.file}:{ev.line}</code> ({ev.context})
                <pre className="text-slate-400 text-[10px] mt-0.5 p-1 bg-[#111724] rounded">{ev.excerpt}</pre>
              </div>
            ))}
            {documentationEvidence.map((ev, i) => (
              <div key={i} className="text-slate-300 text-[11px]">
                • Document: <code className="text-blue-300">{ev.file}:{ev.line}</code> ({ev.context})
                <pre className="text-slate-400 text-[10px] mt-0.5 p-1 bg-[#111724] rounded">{ev.excerpt}</pre>
              </div>
            ))}
            {onViewSource && (
              <div className="pt-2 border-t border-[#1e293b]">
                <button
                  onClick={onViewSource}
                  className="text-xs text-[#38bdf8] hover:underline flex items-center space-x-1"
                >
                  <span>Open in Source Inspector</span>
                  <span>&rarr;</span>
                </button>
              </div>
            )}
          </div>
        )}

        {activeStage === 'invariant' && (
          <div className="space-y-2">
            <span className="text-[#38bdf8] font-bold block">BOUND INVARIANT:</span>
            {invariant ? (
              <div className="space-y-1 text-slate-300 text-[11px]">
                <div>Name: <strong className="text-white">{invariant.name}</strong> ({invariant.id})</div>
                <div className="text-slate-400">Rationale: {invariant.rationale}</div>
              </div>
            ) : (
              <div className="text-slate-400 text-[11px]">
                Specification parity contract: Source code configuration must match README and OpenAPI claims.
              </div>
            )}
          </div>
        )}

        {activeStage === 'counterexample' && (
          <div className="space-y-2">
            <span className="text-red-400 font-bold block">GAMMA COUNTEREXAMPLE:</span>
            {counterexample ? (
              <div className="space-y-1.5 text-slate-300 text-[11px]">
                <div>Trigger: <span className="text-red-300">{counterexample.trigger}</span></div>
                <div>Violation: <span className="text-slate-400">{counterexample.observedViolation}</span></div>
                {counterexample.testCode && (
                  <div className="text-[10px] text-slate-500 pt-1">
                    ✓ Synthesized Vitest regression test artifact ready.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-400 text-[11px]">No formal counterexample needed for documentation drift.</div>
            )}
          </div>
        )}

        {activeStage === 'patch' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400 font-bold">CANDIDATE REPAIR PATCH:</span>
              <div className="flex items-center space-x-2">
                {patch && onApplyPatch && (
                  <button
                    onClick={() => onApplyPatch(patch)}
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    Apply Patch in RAM &rarr;
                  </button>
                )}
                {patch && onViewPatch && (
                  <button
                    onClick={() => onViewPatch(patch.targetFile)}
                    className="text-xs text-[#38bdf8] hover:underline"
                  >
                    View Diff &rarr;
                  </button>
                )}
              </div>
            </div>
            {patch ? (
              <div className="space-y-1 text-slate-300 text-[11px]">
                <div>Strategy: <code className="text-emerald-300">{patch.strategy}</code></div>
                <div>Target: <code className="text-white">{patch.targetFile}</code></div>
                <p className="text-slate-400">{patch.description}</p>
              </div>
            ) : (
              <div className="text-slate-400 text-[11px]">No patch available.</div>
            )}
          </div>
        )}

        {activeStage === 'verification' && (
          <div className="space-y-2">
            <span className="text-purple-400 font-bold block">VERIFICATION GATE:</span>
            <div className="space-y-1 text-slate-300 text-[11px]">
              {displayedVerification?.checks?.map((c, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <span className={c.status === 'passed' ? 'text-emerald-400' : c.status === 'skipped' ? 'text-slate-400' : 'text-red-400'}>
                    {c.status === 'passed' ? '✓' : c.status === 'skipped' ? '○' : '✗'}
                  </span>
                  <span className={c.status === 'passed' ? 'text-slate-200' : 'text-slate-400'}>{c.name}: {String(c.status || 'skipped').toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
