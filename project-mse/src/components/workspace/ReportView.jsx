import React, { useState } from 'react';
import { downloadJsonReport, downloadMarkdownReport } from '../../utils/downloadUtils';

export default function ReportView({
  report,
  repoName
}) {
  const [tab, setTab] = useState('markdown');
  const [copied, setCopied] = useState(false);

  const jsonContent = report?.json ? JSON.stringify(report.json, null, 2) : '';
  const mdContent = report?.markdown || '';

  const handleCopy = () => {
    const text = tab === 'markdown' ? mdContent : jsonContent;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const summary = report?.json?.summary || {};

  return (
    <div className="flex-1 flex flex-col font-mono text-xs bg-[#090d16] overflow-hidden">
      {/* Report Header Bar */}
      <div className="bg-[#0d131f] border-b border-[#263147] p-4 space-y-4 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-100 text-sm uppercase tracking-wider">AUDIT REPORT</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase border ${
                summary.verificationStatus === 'VERIFIED'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              }`}>
                {summary.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'NEEDS REVIEW'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {summary.repositoryName || repoName} | Run ID: {summary.runId} | Analyzed: {summary.analyzedAt ? new Date(summary.analyzedAt).toLocaleString() : 'N/A'}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded border border-[#263147] text-slate-300 hover:text-white hover:bg-[#111724] text-xs"
            >
              {copied ? 'Copied' : 'Copy Report'}
            </button>
            <button
              onClick={() => downloadMarkdownReport(mdContent, repoName)}
              className="px-3 py-1.5 rounded bg-[#111724] border border-[#263147] text-slate-300 hover:text-white hover:bg-[#1e293b] text-xs"
            >
              Export .md
            </button>
            <button
              onClick={() => downloadJsonReport(report?.json, repoName)}
              className="px-3 py-1.5 rounded bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-slate-100 font-bold text-xs"
            >
              Export .json
            </button>
          </div>
        </div>

        {/* Format Toggle */}
        <div className="flex items-center bg-[#111724] border border-[#263147] rounded-sm p-0.5 w-fit">
          <button
            onClick={() => setTab('markdown')}
            className={`px-3 py-1 rounded-sm ${
              tab === 'markdown'
                ? 'bg-[#1e293b] text-slate-100 font-bold border border-[#38bdf8]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Markdown (.md)
          </button>
          <button
            onClick={() => setTab('json')}
            className={`px-3 py-1 rounded-sm ${
              tab === 'json'
                ? 'bg-[#1e293b] text-slate-100 font-bold border border-[#38bdf8]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            JSON (.json)
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6 bg-[#060910] text-slate-300">
        <div className="max-w-5xl mx-auto">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
            {tab === 'markdown' ? mdContent : jsonContent}
          </pre>
        </div>
      </div>
    </div>
  );
}
