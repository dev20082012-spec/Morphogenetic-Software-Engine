import React from 'react';

export default function OverviewView({
  pipelineResult,
  snapshot,
  status,
  onRunAudit,
  onNavigateMode
}) {
  const analysis = pipelineResult?.analysis;
  const drift = pipelineResult?.drift;
  const invariants = pipelineResult?.invariants;
  const counterexamples = pipelineResult?.counterexamples;
  const patches = pipelineResult?.patches;
  const verification = pipelineResult?.verification;

  const totalDuration = pipelineResult?.totalDurationMs ?? 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs text-slate-200 bg-[#090d16]">
      {/* Top Banner / Repository Status */}
      <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3.5 flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-slate-100 tracking-wider">
              {snapshot?.metadata?.name || 'repository'}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-sm uppercase font-semibold bg-[#162032] text-slate-300 border border-[#24334d]">
              {snapshot?.metadata?.source === 'zip' ? 'ZIP ARCHIVE' : 'BUNDLED DEMO'}
            </span>
            {snapshot?.metadata?.patched && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm font-bold bg-[#13281c] text-[#4ade80] border border-[#166534]">
                PATCHED IN RAM
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            {snapshot?.metadata?.description || 'Active in-memory repository representation'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="bg-[#111724] border border-[#263147] px-2.5 py-1 rounded-sm text-right">
            <span className="text-[10px] text-slate-500 block">Analysis Duration</span>
            <span className="text-xs font-bold text-[#38bdf8]">
              {totalDuration > 0 ? `${totalDuration}ms` : '--'}
            </span>
          </div>

          <button
            onClick={onRunAudit}
            disabled={status === 'running'}
            className="px-3 py-1.5 rounded-sm bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-slate-100 font-bold text-xs disabled:opacity-50 transition"
          >
            {status === 'running' ? 'Running Audit...' : 'Run MSE Audit'}
          </button>
        </div>
      </div>

      {/* Ingestion Security & Fault-Tolerance Audit Banner */}
      {(snapshot?.metadata?.skippedFiles?.length > 0 || snapshot?.metadata?.warnings?.length > 0 || analysis?.parseErrors?.length > 0) && (
        <div className="bg-[#1a1209] border border-[#78350f] rounded-sm p-3.5 space-y-2 text-[#fbbf24]">
          <div className="flex items-center space-x-2 text-xs font-bold">
            <span>[!] INGESTION SECURITY &amp; FAULT-TOLERANCE AUDIT</span>
          </div>
          <div className="text-[11px] text-amber-200/90 space-y-1">
            {snapshot?.metadata?.skippedFiles?.map((sf, idx) => (
              <div key={idx} className="flex items-center space-x-2 font-mono">
                <span className="text-[#f87171] font-bold">[{sf.reason}]:</span>
                <span className="text-slate-300">{sf.path}</span>
              </div>
            ))}
            {snapshot?.metadata?.warnings?.map((w, idx) => (
              <div key={idx} className="text-amber-300">
                • {w}
              </div>
            ))}
            {analysis?.parseErrors?.map((pe, idx) => (
              <div key={idx} className="text-[#f87171]">
                • Parse degradation in {pe.file}: {pe.error} (preserved partial analysis)
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3 space-y-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Repository Scale</span>
          <div className="text-lg font-bold text-slate-100">
            {snapshot?.files?.length || 0} <span className="text-xs font-normal text-slate-400">files</span>
          </div>
          <div className="text-[10px] text-slate-400">
            {analysis?.repositoryStats?.sourceFiles || 0} source ({analysis?.repositoryStats?.totalLines || 0} lines)
          </div>
        </div>

        <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3 space-y-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Discovered Routes</span>
          <div className="text-lg font-bold text-slate-100">
            {analysis?.routes?.length || 0} <span className="text-xs font-normal text-slate-400">endpoints</span>
          </div>
          <div className="text-[10px] text-slate-400">
            {analysis?.routes?.filter(r => r.hasAuth).length || 0} guarded / {analysis?.routes?.filter(r => !r.hasAuth).length || 0} unguarded
          </div>
        </div>

        <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3 space-y-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Invariant Health</span>
          <div className="text-lg font-bold text-slate-100 flex items-center space-x-1.5">
            <span className={invariants?.summary?.violated > 0 ? 'text-[#f87171]' : 'text-[#4ade80]'}>
              {invariants?.summary?.satisfied || 0}/{invariants?.summary?.total || 0}
            </span>
            <span className="text-xs font-normal text-slate-400">bound</span>
          </div>
          <div className="text-[10px] text-slate-400">
            {invariants?.summary?.violated || 0} violated / {invariants?.summary?.unknown || 0} unknown
          </div>
        </div>

        <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3 space-y-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Verification State</span>
          <div className="text-lg font-bold">
            {verification?.status === 'VERIFIED' ? (
              <span className="text-[#4ade80]">VERIFIED</span>
            ) : verification?.status === 'FAILED' ? (
              <span className="text-[#f87171]">FAILED</span>
            ) : (
              <span className="text-slate-400">PENDING</span>
            )}
          </div>
          <div className="text-[10px] text-slate-400">
            {verification?.checks?.filter(c => c.status === 'passed').length || 0}/{verification?.checks?.length || 0} checks passed
          </div>
        </div>
      </div>

      {/* Findings Breakdown & Quick Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div 
          onClick={() => onNavigateMode('drift')}
          className="bg-[#0d131f] border border-[#263147] hover:border-[#fbbf24] rounded-sm p-3 cursor-pointer transition space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-200">EPIGENETIC DRIFT</span>
            <span className="text-[10px] bg-[#291e0b] text-[#fbbf24] border border-[#78350f] px-1.5 py-0.2 rounded-sm font-bold">
              {drift?.stats?.driftFindingsCount || 0} Findings
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Reconciles documented port, HMAC authentication, and environment variable claims against AST code reality.
          </p>
          <div className="text-[10px] text-[#fbbf24] flex items-center space-x-1 group-hover:underline">
            <span>Inspect Spec vs Reality Drift &rarr;</span>
          </div>
        </div>

        <div 
          onClick={() => onNavigateMode('counterexample')}
          className="bg-[#0d131f] border border-[#263147] hover:border-[#f87171] rounded-sm p-3 cursor-pointer transition space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-200">CEGIS COUNTEREXAMPLES</span>
            <span className="text-[10px] bg-[#2a1215] text-[#f87171] border border-[#7f1d1d] px-1.5 py-0.2 rounded-sm font-bold">
              {counterexamples?.summary?.generated || 0} Generated
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Concrete falsification scenarios and reproducible Vitest test artifacts exposing unguarded attack vectors.
          </p>
          <div className="text-[10px] text-[#f87171] flex items-center space-x-1 group-hover:underline">
            <span>View Test Antigens &rarr;</span>
          </div>
        </div>

        <div 
          onClick={() => onNavigateMode('diff')}
          className="bg-[#0d131f] border border-[#263147] hover:border-[#4ade80] rounded-sm p-3 cursor-pointer transition space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-200">SYNTHESIZED REPAIRS</span>
            <span className="text-[10px] bg-[#13281c] text-[#4ade80] border border-[#166534] px-1.5 py-0.2 rounded-sm font-bold">
              {patches?.summary?.generated || 0} Ready
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Minimal atomic patches generated from actual file content: auth guards, signature verification, port fixes.
          </p>
          <div className="text-[10px] text-[#4ade80] flex items-center space-x-1 group-hover:underline">
            <span>Review & Apply Patches &rarr;</span>
          </div>
        </div>
      </div>

      {/* Discovered Endpoints and Environment Variables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Endpoints Table */}
        <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="font-bold text-xs text-slate-200 uppercase">
              Discovered Route Call-Graph ({analysis?.routes?.length || 0})
            </span>
            <span className="text-[10px] text-slate-500">Alpha AST Extraction</span>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {analysis?.routes && analysis.routes.length > 0 ? (
              analysis.routes.map((route, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-1.5 bg-[#111724] border border-[#1e293b] rounded-sm text-[11px]"
                >
                  <div className="flex items-center space-x-2">
                    <span className={`px-1 py-0.2 rounded-sm text-[9px] font-bold ${
                      route.method === 'GET' ? 'bg-[#1e293b] text-[#38bdf8]' :
                      route.method === 'POST' ? 'bg-[#2a1b12] text-[#fb923c]' :
                      'bg-[#1e293b] text-slate-300'
                    }`}>
                      {route.method}
                    </span>
                    <span className="font-semibold text-slate-200">{route.path}</span>
                    <span className="text-slate-500 text-[10px]">({route.file}:{route.line})</span>
                  </div>

                  <span className={`text-[9px] px-1 py-0.2 rounded-sm font-semibold uppercase border ${
                    route.hasAuth 
                      ? 'bg-[#13281c] text-[#4ade80] border-[#166534]' 
                      : 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]'
                  }`}>
                    {route.hasAuth ? 'GUARDED' : 'UNGUARDED'}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-center py-4">No routes indexed yet. Run audit.</div>
            )}
          </div>
        </div>

        {/* Environment & Config Reality */}
        <div className="bg-[#0d131f] border border-[#263147] rounded-sm p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="font-bold text-xs text-slate-200 uppercase">
              Configuration Topology ({analysis?.environmentVariables?.length || 0})
            </span>
            <span className="text-[10px] text-slate-500">process.env references</span>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {analysis?.environmentVariables && analysis.environmentVariables.length > 0 ? (
              analysis.environmentVariables.map((envVar, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-1.5 bg-[#111724] border border-[#1e293b] rounded-sm text-[11px]"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-[#38bdf8] font-bold">${envVar.name}</span>
                    <span className="text-slate-500 text-[10px]">({envVar.file}:{envVar.line})</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {envVar.defaultValue ? (
                      <span className="text-slate-400 text-[10px]">default: <code className="text-slate-200">{envVar.defaultValue}</code></span>
                    ) : (
                      <span className="text-slate-500 text-[10px]">no default</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-center py-4">No environment variables detected.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
