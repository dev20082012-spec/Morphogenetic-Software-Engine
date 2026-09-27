import React, { useState } from 'react';

export default function TechnicalDrawer({
  isOpen,
  onClose,
  pipelineResult,
  logs = []
}) {
  const [activeTab, setActiveTab] = useState('alpha');

  if (!isOpen) return null;

  const analysis = pipelineResult?.analysis;
  const drift = pipelineResult?.drift;
  const counterexamples = pipelineResult?.counterexamples;
  const invariants = pipelineResult?.invariants;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[620px] bg-[#0d131f] border-l border-[#263147] shadow-2xl flex flex-col z-50 font-mono text-xs text-slate-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-[#263147] bg-[#090d16] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <span className="text-[#38bdf8] font-bold text-sm">[&lt;/&gt;]</span>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Technical Analysis &amp; Invariant Manifold
            </h2>
            <p className="text-[10px] text-slate-400">Progressive disclosure of compiler &amp; prover internals</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white px-2 py-1 rounded bg-[#111724] border border-[#263147] text-xs font-mono"
        >
          ✕ Close
        </button>
      </div>

      {/* Technical Tabs Bar */}
      <div className="px-4 py-2 bg-[#0b0f19] border-b border-[#1e293b] flex items-center space-x-2 overflow-x-auto shrink-0 select-none">
        <button
          onClick={() => setActiveTab('alpha')}
          className={`px-3 py-1 rounded-sm text-xs font-mono transition ${
            activeTab === 'alpha'
              ? 'bg-[#1e293b] text-[#38bdf8] border border-[#38bdf8] font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          [Alpha] AST Graph
        </button>

        <button
          onClick={() => setActiveTab('beta')}
          className={`px-3 py-1 rounded-sm text-xs font-mono transition ${
            activeTab === 'beta'
              ? 'bg-[#291e0b] text-[#fbbf24] border border-[#78350f] font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          [Beta] Spec Drift
        </button>

        <button
          onClick={() => setActiveTab('gamma')}
          className={`px-3 py-1 rounded-sm text-xs font-mono transition ${
            activeTab === 'gamma'
              ? 'bg-[#2a1215] text-[#f87171] border border-[#7f1d1d] font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          [Gamma] Counterexamples
        </button>

        <button
          onClick={() => setActiveTab('verify')}
          className={`px-3 py-1 rounded-sm text-xs font-mono transition ${
            activeTab === 'verify'
              ? 'bg-[#13281c] text-[#4ade80] border border-[#166534] font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          [Kernel] Invariants
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-3 py-1 rounded-sm text-xs font-mono transition ${
            activeTab === 'logs'
              ? 'bg-[#1e293b] text-slate-200 border border-slate-600 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          [Telemetry]
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ALPHA TAB */}
        {activeTab === 'alpha' && (
          <div className="space-y-4">
            <div className="bg-[#111724] border border-[#1e293b] rounded p-3 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Alpha Call-Graph &amp; Symbol Engine</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Static AST symbol extraction identifies exported functions, call chains, ingress routes, and environment variable bindings without runtime execution.
              </p>
            </div>

            {/* Ingress Routes */}
            <div className="space-y-2">
              <h3 className="font-bold text-xs text-slate-200 uppercase">
                Discovered Endpoints ({analysis?.routes?.length || 0})
              </h3>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {analysis?.routes?.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-[#060910] border border-[#1e293b] rounded text-[11px]">
                    <div className="flex items-center space-x-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        r.method === 'GET' ? 'bg-[#1e293b] text-[#38bdf8]' : 'bg-[#2a1b12] text-[#fb923c]'
                      }`}>
                        {r.method}
                      </span>
                      <span className="font-semibold text-white">{r.path}</span>
                      <span className="text-slate-500 text-[10px]">({r.file}:{r.line})</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border ${
                      r.hasAuth
                        ? 'bg-[#13281c] text-[#4ade80] border-[#166534]'
                        : 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
                    }`}>
                      {r.hasAuth ? 'GUARDED' : 'UNGUARDED'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Extracted Symbols */}
            <div className="space-y-2">
              <h3 className="font-bold text-xs text-slate-200 uppercase">
                AST Symbols ({analysis?.symbols?.length || 0})
              </h3>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {analysis?.symbols?.map((s, i) => (
                  <div key={i} className="p-2 bg-[#060910] border border-[#1e293b] rounded text-[11px]">
                    <div className="text-[#38bdf8] font-bold truncate">{s.name}</div>
                    <div className="text-slate-500 text-[10px]">{s.kind} • {s.file}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* BETA TAB */}
        {activeTab === 'beta' && (
          <div className="space-y-4">
            <div className="bg-[#111724] border border-[#1e293b] rounded p-3 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Beta Specification Reconciliation</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Extracts formal declarations from README.md, .env.example, and OpenAPI specs, verifying each claim against source AST reality.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-xs text-slate-200 uppercase">
                Reconciliation Findings ({drift?.findings?.length || 0})
              </h3>
              <div className="space-y-2">
                {drift?.findings?.map((f, i) => (
                  <div key={i} className="p-3 bg-[#060910] border border-[#1e293b] rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-400 text-xs">{f.title}</span>
                      <span className="text-[10px] bg-[#291e0b] text-[#fbbf24] px-1.5 py-0.5 rounded border border-[#78350f]">
                        DRIFT
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px]">{f.description}</p>
                    {f.sourceEvidence?.[0] && (
                      <div className="p-2 bg-[#111724] rounded text-[10px] text-amber-200">
                        Code: <code>{f.sourceEvidence[0].excerpt}</code> ({f.sourceEvidence[0].file}:{f.sourceEvidence[0].line})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* GAMMA TAB */}
        {activeTab === 'gamma' && (
          <div className="space-y-4">
            <div className="bg-[#111724] border border-[#1e293b] rounded p-3 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Gamma Counterexample Synthesis</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Generates concrete falsification inputs and executable Vitest regression tests proving where the repository fails its contractual specifications.
              </p>
            </div>

            <div className="space-y-3">
              {counterexamples?.counterexamples?.map((cx, i) => (
                <div key={i} className="p-3 bg-[#060910] border border-[#1e293b] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-red-400 font-bold text-xs">[{cx.id}] {cx.description}</span>
                    <span className="text-[10px] bg-red-950/60 text-red-300 px-1.5 py-0.5 rounded border border-red-800">
                      FALSIFIED
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 leading-relaxed bg-[#111724] p-2 rounded">
                    <strong>Scenario: </strong>{cx.scenario}
                  </div>
                  {cx.testCode && (
                    <pre className="text-[10px] p-2 bg-[#080c14] rounded text-slate-400 overflow-x-auto max-h-36">
                      {cx.testCode.slice(0, 300)}...
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KERNEL / INVARIANTS TAB */}
        {activeTab === 'verify' && (
          <div className="space-y-4">
            <div className="bg-[#111724] border border-[#1e293b] rounded p-3 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Verification Kernel &amp; Invariants</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Evaluates system invariants across security, documentation, and relational boundaries to determine repository convergence.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-xs text-slate-200 uppercase">
                Bound Invariants ({invariants?.invariants?.length || 0})
              </h3>
              <div className="space-y-2">
                {invariants?.invariants?.map((inv, i) => (
                  <div key={i} className="p-2.5 bg-[#060910] border border-[#1e293b] rounded flex items-center justify-between text-[11px]">
                    <div className="space-y-0.5">
                      <div className="font-bold text-white">[{inv.id}] {inv.name}</div>
                      <div className="text-slate-400 text-[10px]">{inv.rationale}</div>
                    </div>

                    <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase border ${
                      inv.status === 'SATISFIED'
                        ? 'bg-[#13281c] text-[#4ade80] border-[#166534]'
                        : 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
                    }`}>
                      {inv.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="space-y-2">
            <h3 className="font-bold text-xs text-slate-200 uppercase">Engine Telemetry Stream</h3>
            <div className="p-3 bg-[#060910] border border-[#1e293b] rounded font-mono text-[11px] space-y-1 max-h-96 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i} className="text-slate-300">
                  <span className="text-slate-600 select-none">&gt; </span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
