import React from 'react';

export default function VerificationView({
  verification,
  invariants,
  onReRunVerification,
  status
}) {
  const checks = verification?.checks || [];
  const isVerified = verification?.status === 'VERIFIED';
  const durationMs = verification?.durationMs ?? 0;
  const invariantList = invariants?.invariants || [];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs text-slate-200 bg-[#090d16]">
      {/* Top Banner */}
      <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              IN-MEMORY CEGIS VERIFICATION AUDIT
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase border ${
              isVerified
                ? 'bg-[#13281c] text-[#4ade80] border-[#166534]'
                : 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
            }`}>
              {verification?.status || 'PENDING'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Validated against MSE AST and drift checks without persisting files to disk. Verified in ephemeral RAM.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-[#111724] border border-[#263147] px-3 py-1 rounded-sm text-right">
            <span className="text-[10px] text-slate-500 block">Verification Time</span>
            <span className="text-xs font-bold text-[#38bdf8]">{durationMs}ms</span>
          </div>

          <button
            onClick={onReRunVerification}
            disabled={status === 'running'}
            className="px-3 py-1.5 bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-slate-100 rounded-sm text-xs font-bold disabled:opacity-50 transition"
          >
            {status === 'running' ? 'Verifying...' : 'Re-run Verification'}
          </button>
        </div>
      </div>

      {/* Verification Checks Table */}
      <div className="bg-[#0d131f] border border-[#263147] rounded-sm overflow-hidden">
        <div className="bg-[#111724] border-b border-[#263147] px-3 py-2 flex items-center justify-between">
          <span className="font-bold text-xs text-slate-200 uppercase">
            Executed Verification Checks ({checks.length})
          </span>
          <span className="text-[10px] text-slate-400">
            {checks.filter(c => c.status === 'passed').length} Passed / {checks.filter(c => c.status === 'failed').length} Failed
          </span>
        </div>

        <div className="divide-y divide-[#1e293b]">
          {checks.map((check, idx) => {
            const passed = check.status === 'passed';

            return (
              <div key={idx} className="p-3 flex items-start justify-between hover:bg-[#111724] transition">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-200">
                      {check.name}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    {check.detail}
                  </div>
                </div>

                <div className="shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase border ${
                    passed
                      ? 'bg-[#13281c] text-[#4ade80] border-[#166534]'
                      : 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
                  }`}>
                    {passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invariant Health Status */}
      <div className="bg-[#0d131f] border border-[#263147] rounded-sm overflow-hidden">
        <div className="bg-[#111724] border-b border-[#263147] px-3 py-2 flex items-center justify-between">
          <span className="font-bold text-xs text-slate-200 uppercase">
            Formal Invariant Status ({invariantList.length})
          </span>
          <span className="text-[10px] text-slate-400">
            {invariantList.filter(i => i.status === 'satisfied').length} Satisfied / {invariantList.filter(i => i.status === 'violated').length} Violated
          </span>
        </div>

        <div className="divide-y divide-[#1e293b]">
          {invariantList.map((inv) => {
            const isSatisfied = inv.status === 'satisfied';

            return (
              <div key={inv.id} className="p-3 flex items-center justify-between hover:bg-[#111724]">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-[#38bdf8] font-bold text-xs">[{inv.id}]</span>
                    <span className="font-semibold text-slate-200 text-xs">{inv.name}</span>
                    <span className="text-[9px] uppercase px-1 py-0.2 rounded-sm bg-[#162032] text-slate-400 border border-[#24334d]">
                      {inv.category}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {inv.statement}
                  </div>
                </div>

                <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase border ${
                  isSatisfied
                    ? 'bg-[#13281c] text-[#4ade80] border-[#166534]'
                    : 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
                }`}>
                  {isSatisfied ? 'SATISFIED' : 'VIOLATED'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
