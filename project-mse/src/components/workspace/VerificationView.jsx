import React from 'react';

export default function VerificationView({
  verification,
  invariants,
  onReRunVerification,
  status,
  onNavigateTab,
  pipelineResult,
  snapshot,
  decision
}) {
  const checks = decision?.checks || verification?.checks || [];
  const decisionStatus = decision?.status || verification?.status;
  const isVerified = decisionStatus === 'VERIFIED';
  const isRejected = decisionStatus === 'REJECTED' || decisionStatus === 'FAILED';
  const isPending = !isVerified && !isRejected;
  const durationMs = verification?.durationMs ?? 0;
  const invariantList = invariants?.invariants || [];
  const totalDuration = pipelineResult?.totalDurationMs ?? 0;
  const filesCount = snapshot?.files?.length || 0;
  const findingsCount = (pipelineResult?.analysis?.findings?.length || 0) + (pipelineResult?.drift?.findings?.length || 0);

  const failedChecks = checks.filter(c => c.status === 'failed');

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 font-sans text-slate-200 bg-[#090d16]">
      {/* VERIFICATION GATE BANNER */}
      <div className={`bg-[#0d131f] border rounded-lg p-6 space-y-4 shadow-sm ${
        isVerified ? 'border-emerald-500/30' : isRejected ? 'border-red-500/30' : 'border-[#263147]'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <span className={`text-xl font-bold uppercase tracking-wider ${
                isVerified ? 'text-emerald-400' : isRejected ? 'text-red-400' : 'text-amber-400'
              }`}>
                {isVerified ? 'VERIFIED' : isRejected ? 'REJECTED' : 'NEEDS REVIEW'}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono border ${
                isVerified
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : isRejected
                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              }`}>
                {isVerified ? 'MSE VERIFICATION GATE PASSED' : isRejected ? 'MSE VERIFICATION GATE FAILED' : 'PENDING PATCH APPLICATION'}
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              {isVerified
                ? 'All required checks passed against in-memory repository contracts. Invariants restored with no newly introduced issues.'
                : isRejected
                ? 'Verification could not pass. See failed checks below for details.'
                : `${checks.filter(c => c.status === 'passed').length} of ${checks.length} checks passed.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="bg-[#111724] border border-[#263147] px-3 py-2 rounded text-right">
              <span className="text-[10px] text-slate-500 block">Analysis Duration</span>
              <span className="text-xs font-bold text-[#38bdf8]">{totalDuration > 0 ? `${totalDuration}ms` : '--'}</span>
            </div>
            <div className="bg-[#111724] border border-[#263147] px-3 py-2 rounded text-right">
              <span className="text-[10px] text-slate-500 block">Verification Duration</span>
              <span className="text-xs font-bold text-[#38bdf8]">{durationMs}ms</span>
            </div>
            <div className="bg-[#111724] border border-[#263147] px-3 py-2 rounded text-right">
              <span className="text-[10px] text-slate-500 block">Files Analyzed</span>
              <span className="text-xs font-bold text-slate-200">{filesCount}</span>
            </div>
            <div className="bg-[#111724] border border-[#263147] px-3 py-2 rounded text-right">
              <span className="text-[10px] text-slate-500 block">Findings</span>
              <span className="text-xs font-bold text-slate-200">{findingsCount}</span>
            </div>
            <button
              onClick={onReRunVerification}
              disabled={status === 'running'}
              className="px-4 py-2 rounded bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-slate-100 text-xs font-bold disabled:opacity-50 transition"
            >
              {status === 'running' ? 'Verifying...' : 'Re-run Verification'}
            </button>
          </div>
        </div>

        {/* Verification Gate Checklist */}
        <div className="pt-4 border-t border-[#1e293b]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {checks.map((check, idx) => {
              const passed = check.status === 'passed';
              const skipped = check.status === 'skipped';
              const statusLabel = String(check.status || 'skipped').toUpperCase();
              return (
              <div
                key={idx}
                className={`flex items-center space-x-2 p-3 rounded bg-[#111724} border ${
                  passed
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-[#263147]'
                }`}
              >
                <span className={passed ? 'text-emerald-400 font-bold text-lg' : skipped ? 'text-slate-400 text-lg' : 'text-red-400 text-lg'}>
                  {passed ? '✓' : skipped ? '○' : '✗'}
                </span>
                <span className={passed ? 'text-slate-200' : 'text-slate-400'}>
                  {check.name} — {statusLabel}
                </span>
              </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#1e293b]">
            <button
              onClick={() => onNavigateTab?.('findings')}
              className="px-4 py-2 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-slate-200 text-xs font-medium transition"
            >
              View Evidence
            </button>
            <button
              onClick={() => onNavigateTab?.('changes')}
              className="px-4 py-2 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-[#38bdf8] text-xs font-medium transition"
            >
              View Diff
            </button>
            <button
              onClick={() => onNavigateTab?.('report')}
              className="px-4 py-2 rounded bg-[#162032] hover:bg-[#1e293b] border border-[#263147] text-purple-300 text-xs font-medium transition"
            >
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* REJECTED STATE - Show Exactly Why */}
      {isRejected && failedChecks.length > 0 && (
        <div className="bg-[#2a1215] border border-red-500/30 rounded-lg p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center space-x-2">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <span>Verification Failed — Root Causes</span>
          </h3>
          <div className="space-y-2 text-xs">
            {failedChecks.map((check, idx) => (
              <div key={idx} className="bg-[#1a0a0d] border border-red-500/20 rounded p-3 space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-red-400 font-bold">✗</span>
                  <span className="font-semibold text-slate-200">{check.name}</span>
                </div>
                <p className="text-slate-300 ml-6 leading-relaxed">{check.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VERIFICATION CHECKS TABLE */}
      <div className="bg-[#0d131f] border border-[#263147] rounded-lg overflow-hidden">
        <div className="bg-[#111724] border-b border-[#263147] px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-xs text-slate-200 uppercase">
            Executed Verification Checks ({checks.length})
          </span>
          <span className="text-[10px] text-slate-400">
            {checks.filter(c => c.status === 'passed').length} PASS / {checks.filter(c => c.status === 'failed').length} FAIL / {checks.filter(c => c.status === 'skipped').length} SKIPPED
          </span>
        </div>

        <div className="divide-y divide-[#1e293b]">
          {checks.map((check, idx) => {
            const passed = check.status === 'passed';
            const skipped = check.status === 'skipped';
            const statusLabel = String(check.status || 'skipped').toUpperCase();

            return (
              <div key={idx} className="p-4 flex items-start justify-between hover:bg-[#111724] transition">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs font-bold ${
                      passed ? 'text-emerald-400' : skipped ? 'text-slate-400' : 'text-red-400'
                    }`}>
                      {passed ? '✓' : skipped ? '○' : '✗'}
                    </span>
                    <span className="text-xs font-semibold text-slate-200">
                      {check.name}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed ml-6">
                    {check.detail}
                  </div>
                </div>

                <div className="shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                    passed
                      ? 'bg-[#13281c] text-[#4ade80] border-[#166534]'
                      : skipped ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
                  }`}>
                    {statusLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* INVARIANT HEALTH STATUS */}
      <div className="bg-[#0d131f] border border-[#263147] rounded-lg overflow-hidden">
        <div className="bg-[#111724] border-b border-[#263147] px-4 py-3 flex items-center justify-between">
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
              <div key={inv.id} className="p-4 flex items-center justify-between hover:bg-[#111724] transition">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-[#38bdf8] font-bold text-xs">[{inv.id}]</span>
                    <span className="font-semibold text-slate-200 text-xs">{inv.name}</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#162032] text-slate-400 border border-[#24334d]">
                      {inv.category}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {inv.statement}
                  </div>
                </div>

                <span className={`text-[10px] px-2.5 py-0.5 rounded font-bold uppercase border ${
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
