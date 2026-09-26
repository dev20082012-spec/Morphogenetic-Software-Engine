import React, { useRef, useEffect, useState } from 'react';

export default function CodeEditor({ 
  file, 
  viewMode, 
  onViewModeChange,
  diffData,
  highlightLine,
  selectedAstNode,
  openTabs,
  onSelectTab,
  onCloseTab
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
        Select a file from the explorer or select an invariant to inspect code.
      </div>
    );
  }

  const lines = file.content.split('\n');

  return (
    <div className="flex-1 flex flex-col bg-[#090d16] overflow-hidden border-r border-[#263147]">
      <div className="bg-[#0d131f] border-b border-[#263147] flex items-center justify-between px-2 overflow-x-auto shrink-0 select-none">
        <div className="flex items-center space-x-0.5">
          {openTabs.map(tabPath => {
            const isTabActive = tabPath === file.path;
            const tabName = tabPath.split('/').pop();
            const hasDiff = Boolean(diffData && tabPath === file.path);

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
                {hasDiff && (
                  <span className="text-[9px] text-[#4ade80] font-bold">[DIFF]</span>
                )}
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
          {diffData && (
            <div className="flex items-center bg-[#111724] border border-[#263147] rounded-sm p-0.5 text-[11px] font-mono">
              <button
                onClick={() => onViewModeChange('code')}
                className={`px-2 py-0.5 rounded-sm ${
                  viewMode === 'code' 
                    ? 'bg-[#1e293b] text-slate-100 font-bold border border-[#38bdf8]' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Source Code
              </button>
              <button
                onClick={() => onViewModeChange('diff')}
                className={`px-2 py-0.5 rounded-sm ${
                  viewMode === 'diff' 
                    ? 'bg-[#13281c] text-[#4ade80] font-bold border border-[#166534]' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Unified Diff
              </button>
            </div>
          )}

          <button
            onClick={handleCopy}
            className="px-2 py-0.5 rounded-sm text-[11px] font-mono border border-[#263147] text-slate-400 hover:text-slate-200 hover:bg-[#111724]"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto flex flex-col">
        {viewMode === 'diff' && diffData ? (
          <div className="flex-1 flex flex-col font-mono text-xs">
            <div className="bg-[#0d131f] border-b border-[#263147] p-3 space-y-1.5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="bg-[#13281c] text-[#4ade80] border border-[#166534] px-1.5 py-0.5 rounded-sm text-[10px] font-bold">
                      VERIFIED GREEN
                    </span>
                    <span className="text-slate-200 font-bold text-xs">{diffData.prTitle}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                    <span>Branch: <code className="text-slate-300 font-semibold">{diffData.branch}</code></span>
                    <span>|</span>
                    <span>Author: <span className="text-slate-300">{diffData.author}</span></span>
                    <span>|</span>
                    <span className="text-[#4ade80]">{diffData.blastRadius}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono bg-[#162032] text-slate-300 border border-[#24334d] px-2 py-0.5 rounded-sm">
                    Energy: {diffData.energyReduction}
                  </span>
                  <span className="text-[10px] font-mono bg-[#162032] text-slate-300 border border-[#24334d] px-2 py-0.5 rounded-sm">
                    Confidence: {diffData.confidence}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 space-y-3">
              {diffData.chunks.map((chunk, cIdx) => (
                <div key={cIdx} className="border border-[#263147] rounded-sm overflow-hidden bg-[#090d16]">
                  <div className="bg-[#0f1726] px-3 py-1 text-[11px] text-[#38bdf8] border-b border-[#263147] font-bold flex items-center space-x-2">
                    <span>{chunk.header}</span>
                  </div>

                  <div className="divide-y divide-[#162032]">
                    {chunk.lines.map((line, lIdx) => {
                      const isAdd = line.type === 'add';
                      const isRemove = line.type === 'remove';

                      return (
                        <div
                          key={lIdx}
                          className={`flex items-stretch text-xs leading-relaxed ${
                            isAdd
                              ? 'bg-[#0f241a] text-[#86efac] font-medium'
                              : isRemove
                              ? 'bg-[#291316] text-[#fca5a5] font-medium'
                              : 'text-slate-400 hover:bg-[#111724]'
                          }`}
                        >
                          <span className="w-10 text-right pr-2 py-0.5 select-none text-[10px] text-slate-600 bg-[#0c101c] border-r border-[#1e293b]">
                            {line.oldNum || ''}
                          </span>
                          <span className="w-10 text-right pr-2 py-0.5 select-none text-[10px] text-slate-600 bg-[#0c101c] border-r border-[#263147]">
                            {line.newNum || ''}
                          </span>
                          <span className={`w-5 text-center py-0.5 select-none font-bold ${
                            isAdd ? 'text-[#4ade80]' : isRemove ? 'text-[#f87171]' : 'text-slate-600'
                          }`}>
                            {isAdd ? '+' : isRemove ? '-' : ' '}
                          </span>
                          <div className="flex-1 px-2 py-0.5 font-mono whitespace-pre overflow-x-auto">
                            {line.text}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 font-mono text-xs p-2">
            <div className="space-y-0.5">
              {lines.map((codeLine, idx) => {
                const lineNum = idx + 1;
                const isTarget = highlightLine === lineNum;

                return (
                  <div
                    key={idx}
                    ref={isTarget ? lineRef : null}
                    className={`flex items-center ${
                      isTarget
                        ? 'bg-[#1b2b45] text-slate-100 font-bold border border-[#38bdf8]'
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
        )}
      </div>

      {selectedAstNode && (
        <div className="bg-[#0d131f] border-t border-[#263147] p-2.5 shrink-0 flex items-center justify-between font-mono text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-200">AST NODE:</span>
            <span className="bg-[#1e293b] text-slate-200 border border-[#38bdf8] px-1.5 py-0.5 rounded-sm text-[10px]">
              {selectedAstNode.astNode}
            </span>
            <span className="text-slate-400 text-[11px]">
              Target: <code className="text-slate-200">{selectedAstNode.targetFile}:{selectedAstNode.line}</code>
            </span>
          </div>

          <div className="flex items-center space-x-2 text-[11px]">
            <span className="text-slate-500">Proof State:</span>
            <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold ${
              selectedAstNode.proofState === 'VERIFIED_GREEN' || selectedAstNode.proofState === 'RECONCILED'
                ? 'bg-[#13281c] text-[#4ade80] border border-[#166534]'
                : 'bg-[#2a1215] text-[#f87171] border border-[#7f1d1d]'
            }`}>
              {selectedAstNode.proofState}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
