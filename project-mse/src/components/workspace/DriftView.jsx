import React, { useState } from 'react';

export default function DriftView({
  drift,
  onJumpToFile,
  onViewPatch
}) {
  const findings = drift?.findings || [];
  const [selectedFindingId, setSelectedFindingId] = useState(findings[0]?.id || null);

  const activeFinding = findings.find(f => f.id === selectedFindingId) || findings[0];

  if (findings.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center font-mono bg-[#090d16] text-slate-400 space-y-2">
        <span className="text-2xl">🌱</span>
        <h3 className="text-sm font-bold text-slate-200">Zero Epigenetic Drift Detected</h3>
        <p className="text-xs max-w-md text-slate-500">
          Source code AST implementation is completely synchronized with documented OpenAPI contracts and specifications.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden font-mono text-xs bg-[#090d16]">
      {/* Findings List Sidebar */}
      <div className="w-72 border-r border-[#263147] bg-[#0d131f] flex flex-col shrink-0">
        <div className="p-2.5 border-b border-[#263147] flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
            DRIFT FINDINGS ({findings.length})
          </span>
          <span className="text-[10px] bg-[#291e0b] text-[#fbbf24] border border-[#78350f] px-1 py-0.2 rounded-sm font-bold">
            Beta Reconciler
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {findings.map((finding) => {
            const isSelected = activeFinding?.id === finding.id;
            const isCritical = finding.severity === 'CRITICAL';

            return (
              <div
                key={finding.id}
                onClick={() => setSelectedFindingId(finding.id)}
                className={`p-2.5 rounded-sm cursor-pointer border transition ${
                  isSelected
                    ? 'bg-[#1e293b] border-[#38bdf8] text-slate-100'
                    : 'bg-[#111724] border-[#263147] hover:border-slate-600 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[#38bdf8] font-bold text-[11px]">
                    [{finding.id}]
                  </span>
                  <span className={`text-[9px] px-1 py-0.2 rounded-sm font-bold uppercase border ${
                    isCritical
                      ? 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
                      : 'bg-[#291e0b] text-[#fbbf24] border-[#78350f]'
                  }`}>
                    {finding.severity}
                  </span>
                </div>

                <div className="font-semibold text-xs leading-snug line-clamp-2">
                  {finding.title}
                </div>

                <div className="mt-1 text-[10px] text-slate-500 truncate">
                  Confidence: {finding.confidence}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Dual-Column Evidence Comparison */}
      {activeFinding ? (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4">
          {/* Finding Header */}
          <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-[#38bdf8] font-bold text-xs">
                  [{activeFinding.id}]
                </span>
                <span className="font-bold text-sm text-slate-100">
                  {activeFinding.title}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase border ${
                  activeFinding.severity === 'CRITICAL'
                    ? 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
                    : 'bg-[#291e0b] text-[#fbbf24] border-[#78350f]'
                }`}>
                  {activeFinding.severity}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {activeFinding.description}
            </p>
          </div>

          {/* DUAL COLUMN: DOCUMENTATION vs SOURCE REALITY */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
            {/* Left: Documentation Specification */}
            <div className="bg-[#0d131f] border border-[#263147] rounded-sm flex flex-col overflow-hidden">
              <div className="bg-[#111724] border-b border-[#263147] p-2.5 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 font-bold uppercase text-[11px]">
                    DOCUMENTATION SPECIFICATION
                  </span>
                  <span className="text-[9px] bg-[#162032] text-slate-400 border border-[#24334d] px-1 py-0.2 rounded-sm">
                    INTENDED CONTRACT
                  </span>
                </div>
              </div>

              <div className="p-3 space-y-3 flex-1 overflow-y-auto">
                {activeFinding.documentationEvidence && activeFinding.documentationEvidence.length > 0 ? (
                  activeFinding.documentationEvidence.map((ev, idx) => (
                    <div key={idx} className="space-y-1.5 bg-[#090d16] p-2.5 rounded-sm border border-[#1e293b]">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#38bdf8] font-bold">
                          {ev.file}{ev.line ? `:${ev.line}` : ''}
                        </span>
                        <button
                          onClick={() => onJumpToFile(ev.file, ev.line, { ...ev, title: activeFinding.title })}
                          className="text-[10px] text-slate-400 hover:text-slate-100 underline"
                        >
                          Jump to file
                        </button>
                      </div>

                      {ev.excerpt && (
                        <div className="bg-[#111724] p-2 rounded-sm text-slate-200 text-xs font-mono border-l-2 border-[#fbbf24] whitespace-pre-wrap">
                          {ev.excerpt}
                        </div>
                      )}

                      <div className="text-[10px] text-slate-400 leading-relaxed">
                        {ev.context}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 italic py-4">No documentation evidence recorded for this finding.</div>
                )}
              </div>
            </div>

            {/* Right: Source Code Reality */}
            <div className="bg-[#0d131f] border border-[#263147] rounded-sm flex flex-col overflow-hidden">
              <div className="bg-[#111724] border-b border-[#263147] p-2.5 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 font-bold uppercase text-[11px]">
                    SOURCE CODE REALITY
                  </span>
                  <span className="text-[9px] bg-[#2a1215] text-[#f87171] border border-[#7f1d1d] px-1 py-0.2 rounded-sm font-bold">
                    ACTUAL AST STATE
                  </span>
                </div>
              </div>

              <div className="p-3 space-y-3 flex-1 overflow-y-auto">
                {activeFinding.sourceEvidence && activeFinding.sourceEvidence.length > 0 ? (
                  activeFinding.sourceEvidence.map((ev, idx) => (
                    <div key={idx} className="space-y-1.5 bg-[#090d16] p-2.5 rounded-sm border border-[#1e293b]">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#38bdf8] font-bold">
                          {ev.file}{ev.line ? `:${ev.line}` : ''}
                        </span>
                        <button
                          onClick={() => onJumpToFile(ev.file, ev.line, { ...ev, title: activeFinding.title })}
                          className="text-[10px] text-slate-400 hover:text-slate-100 underline"
                        >
                          Jump to code
                        </button>
                      </div>

                      {ev.excerpt && (
                        <div className="bg-[#111724] p-2 rounded-sm text-slate-200 text-xs font-mono border-l-2 border-[#f87171] whitespace-pre-wrap">
                          {ev.excerpt}
                        </div>
                      )}

                      <div className="text-[10px] text-slate-400 leading-relaxed">
                        {ev.context}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 italic py-4">No source code evidence recorded for this finding.</div>
                )}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3 flex items-center justify-between">
            <span className="text-slate-400 text-xs">
              Reconciler strategy: Automatic atomic patch available.
            </span>

            <button
              onClick={() => {
                const targetFile = activeFinding.sourceEvidence[0]?.file || activeFinding.documentationEvidence[0]?.file;
                if (targetFile) onViewPatch(targetFile);
              }}
              className="px-3 py-1 bg-[#13281c] border border-[#166534] text-[#4ade80] hover:bg-[#1a3825] rounded-sm text-xs font-bold"
            >
              View Synthesized Repair Diff &rarr;
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
