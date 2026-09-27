import React, { useRef } from 'react';

export default function HeaderBar({
  repositorySource,
  repositoryName,
  onSelectDemo,
  onSelectEnterpriseDemo,
  onUploadZip,
  status,
  onRunAudit,
  durationMs,
  findingsCount,
  hasPatches,
  allPatchesApplied,
  onApplyAllPatches
}) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadZip(file);
      e.target.value = '';
    }
  };

  return (
    <header className="border-b border-[#263147] bg-[#0d131f] px-4 py-2 flex items-center justify-between shrink-0 select-none">
      {/* Brand & Title */}
      <div className="flex items-center space-x-3">
        <div className="h-7 w-7 rounded-sm bg-[#1e293b] border border-[#334155] flex items-center justify-center font-mono font-bold text-xs text-[#38bdf8]">
          MSE
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xs font-bold tracking-wider text-slate-100 font-mono">PROJECT MSE</h1>
            <span className="text-[9px] uppercase font-mono font-semibold px-1 py-0.5 rounded-sm bg-[#162032] text-slate-400 border border-[#24334d]">
              IDE WORKBENCH v2.0
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Autonomous AST Homeostasis & CEGIS Prover</p>
        </div>
      </div>

      {/* Target Repository Selection */}
      <div className="hidden md:flex items-center space-x-2 font-mono text-xs">
        <span className="text-slate-500 text-[10px]">REPOSITORY TARGET:</span>

        <button
          onClick={onSelectDemo}
          className={`px-2.5 py-1 rounded-sm text-xs font-mono border transition ${
            repositorySource === 'demo' && repositoryName !== 'enterprise-payment-core'
              ? 'bg-[#1e293b] text-slate-100 border-[#38bdf8] font-bold'
              : 'bg-[#111724] text-slate-400 border-[#263147] hover:text-slate-200'
          }`}
        >
          payment-gateway
        </button>

        <button
          onClick={onSelectEnterpriseDemo}
          className={`px-2.5 py-1 rounded-sm text-xs font-mono border transition ${
            repositorySource === 'demo' && repositoryName === 'enterprise-payment-core'
              ? 'bg-[#1e293b] text-slate-100 border-[#38bdf8] font-bold'
              : 'bg-[#111724] text-slate-400 border-[#263147] hover:text-slate-200'
          }`}
        >
          enterprise-payment-core
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className={`px-2.5 py-1 rounded-sm text-xs font-mono border transition flex items-center space-x-1 ${
            repositorySource === 'zip'
              ? 'bg-[#1e293b] text-slate-100 border-[#38bdf8] font-bold'
              : 'bg-[#111724] text-slate-400 border-[#263147] hover:text-slate-200'
          }`}
        >
          <span>Upload ZIP</span>
          {repositorySource === 'zip' && repositoryName && (
            <span className="text-[10px] text-[#38bdf8] truncate max-w-[100px]">
              ({repositoryName})
            </span>
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Primary Actions & Telemetry */}
      <div className="flex items-center space-x-3 font-mono text-xs">
        {/* Quick action buttons */}
        {hasPatches && !allPatchesApplied && (
          <button
            onClick={onApplyAllPatches}
            className="hidden lg:flex px-2.5 py-1 rounded-sm bg-[#13281c] border border-[#166534] text-[#4ade80] hover:bg-[#1a3825] font-bold text-xs"
          >
            Apply All Patches
          </button>
        )}

        <button
          onClick={onRunAudit}
          disabled={status === 'running'}
          className="px-3 py-1 rounded-sm bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] disabled:opacity-50 text-slate-100 font-bold text-xs flex items-center space-x-1.5 shadow-sm"
        >
          {status === 'running' ? (
            <>
              <span className="h-2 w-2 rounded-full bg-[#38bdf8] animate-ping" />
              <span>Running Audit...</span>
            </>
          ) : (
            <span>RUN MSE AUDIT</span>
          )}
        </button>

        {/* Telemetry stats */}
        <div className="flex items-center space-x-2 bg-[#111724] border border-[#263147] px-2.5 py-1 rounded-sm">
          <span className="text-[10px] text-slate-400">Duration:</span>
          <span className="font-bold text-slate-200">
            {durationMs > 0 ? `${durationMs}ms` : '--'}
          </span>

          {findingsCount !== undefined && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-[10px] text-slate-400">Findings:</span>
              <span className={`font-bold ${findingsCount > 0 ? 'text-[#f87171]' : 'text-[#4ade80]'}`}>
                {findingsCount}
              </span>
            </>
          )}
        </div>

        <div className="hidden xl:flex items-center space-x-1.5 text-slate-400 border border-[#263147] px-2 py-1 rounded-sm bg-[#111724]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
          <span className="text-[10px] text-[#4ade80] font-mono">Zero-Retention RAM Mode</span>
        </div>
      </div>
    </header>
  );
}
