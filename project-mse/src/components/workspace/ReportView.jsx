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

  return (
    <div className="flex-1 flex flex-col font-mono text-xs bg-[#090d16] overflow-hidden">
      {/* Report Header Bar */}
      <div className="bg-[#0d131f] border-b border-[#263147] p-2.5 flex items-center justify-between flex-wrap gap-2 shrink-0">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-slate-100 text-xs uppercase">
            AUDIT REPORT
          </span>
          <div className="flex items-center bg-[#111724] border border-[#263147] rounded-sm p-0.5">
            <button
              onClick={() => setTab('markdown')}
              className={`px-2.5 py-0.5 rounded-sm ${
                tab === 'markdown'
                  ? 'bg-[#1e293b] text-slate-100 font-bold border border-[#38bdf8]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Markdown (.md)
            </button>
            <button
              onClick={() => setTab('json')}
              className={`px-2.5 py-0.5 rounded-sm ${
                tab === 'json'
                  ? 'bg-[#1e293b] text-slate-100 font-bold border border-[#38bdf8]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              JSON (.json)
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            className="px-2 py-0.5 rounded-sm border border-[#263147] text-slate-300 hover:text-white hover:bg-[#111724]"
          >
            {copied ? 'Copied' : 'Copy Report'}
          </button>
          <button
            onClick={() => downloadMarkdownReport(mdContent, repoName)}
            className="px-2 py-0.5 rounded-sm bg-[#111724] border border-[#263147] text-slate-300 hover:text-white hover:bg-[#1e293b]"
          >
            Export .md
          </button>
          <button
            onClick={() => downloadJsonReport(report?.json, repoName)}
            className="px-2.5 py-0.5 rounded-sm bg-[#1e293b] hover:bg-[#334155] border border-[#38bdf8] text-slate-100 font-bold"
          >
            Export .json
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-4 bg-[#060910] text-slate-300">
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
          {tab === 'markdown' ? mdContent : jsonContent}
        </pre>
      </div>
    </div>
  );
}
