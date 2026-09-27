import React, { useRef, useEffect, useState } from 'react';

export default function SourceView({
  file,
  highlightLine,
  selectedEvidence,
  openTabs,
  onSelectTab,
  onCloseTab,
  hasPatch,
  onOpenDiff,
  onNavigateToCounterexample
}) {
  const lineRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (highlightLine && lineRef.current) {
      lineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightLine, file?.path]);

  const handleCopy = () => {
    if (!file) return;
    navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#090d16] text-slate-500 font-mono text-xs">
        Select a file from the repository explorer to inspect source code.
      </div>
    );
  }

  const lines = file.content.split('\n');

  return (
    <div className="flex-1 flex flex-col bg-[#090d16] overflow-hidden">
      {/* Tab bar */}
      <div className="bg-[#0d131f] border-b border-[#263147] flex items-center justify-between px-2 overflow-x-auto shrink-0 select-none">
        <div className="flex items-center space-x-0.5">
          {openTabs.map(tabPath => {
            const isTabActive = tabPath === file.path;
            const tabName = tabPath.split('/').pop();

            return (
              <div
                key={tabPath}
                onClick={() => onSelectTab(tabPath)}
                className={`group px-3 py-1.5 text-xs font-mono flex items-center space-x-2 border-r border-[#263147] cursor-pointer ${
                  isTabActive
                    ? 'bg-[#090d16] text-slate-100 border-t-2 border-t-[#38bdf8] font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
                }`}
              >
                <span>{tabName}</span>
                {openTabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tabPath);
                    }}
                    className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 text-slate-500 text-[10px]"
                  >
                    x
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center space-x-2 py-1 pr-2">
          {hasPatch && (
            <button
              onClick={() => onOpenDiff(file.path)}
              className="px-2 py-0.5 rounded-sm text-[11px] font-mono bg-[#13281c] border border-[#166534] text-[#4ade80] hover:bg-[#1a3825] font-bold"
            >
              View Repair Diff
            </button>
          )}

          <button
            onClick={handleCopy}
            className="px-2 py-0.5 rounded-sm text-[11px] font-mono border border-[#263147] text-slate-400 hover:text-slate-200 hover:bg-[#111724]"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Code Area */}
      <div className="flex-1 overflow-auto flex flex-col font-mono text-xs p-2">
        <div className="space-y-0.5">
          {lines.map((codeLine, idx) => {
            const lineNum = idx + 1;
            const isTarget = highlightLine === lineNum;

            return (
              <div
                key={idx}
                ref={isTarget ? lineRef : null}
                className={`flex items-center transition-colors ${
                  isTarget
                    ? 'bg-[#1b2b45] text-slate-100 font-bold border-l-2 border-l-[#38bdf8]'
                    : 'hover:bg-[#111724] text-slate-300'
                }`}
              >
                <span 
                  className={`w-10 text-right pr-2 py-0.5 select-none text-[10px] ${
                    isTarget 
                      ? 'text-[#38bdf8] font-bold' 
                      : 'text-slate-600'
                  }`}
                >
                  {lineNum}
                </span>

                <span className="w-3 flex items-center justify-center shrink-0 text-[10px] text-[#38bdf8]">
                  {isTarget ? '>' : ''}
                </span>

                <span className="flex-1 whitespace-pre py-0.5 pr-2 overflow-x-auto">
                  {codeLine}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Finding / Evidence Footer */}
      {selectedEvidence && (
        <div className="bg-[#0d131f] border-t border-[#263147] p-2.5 shrink-0 flex items-center justify-between font-mono text-xs flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-200">EVIDENCE CONTEXT:</span>
            <span className="bg-[#1e293b] text-slate-200 border border-[#38bdf8] px-1.5 py-0.5 rounded-sm text-[10px]">
              {selectedEvidence.title || selectedEvidence.id || 'Finding'}
            </span>
            <span className="text-slate-400 text-[11px]">
              {selectedEvidence.file}:{selectedEvidence.line || 1} &mdash; {selectedEvidence.context || selectedEvidence.excerpt}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {onNavigateToCounterexample && (
              <button
                onClick={() => onNavigateToCounterexample(selectedEvidence)}
                className="px-2 py-0.5 rounded-sm text-[10px] font-mono bg-[#2a1215] text-[#f87171] border border-[#7f1d1d] hover:bg-[#3d191d]"
              >
                Inspect Counterexample
              </button>
            )}
            {hasPatch && (
              <button
                onClick={() => onOpenDiff(file.path)}
                className="px-2 py-0.5 rounded-sm text-[10px] font-mono bg-[#13281c] text-[#4ade80] border border-[#166534] hover:bg-[#1a3825]"
              >
                View Unified Diff
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
