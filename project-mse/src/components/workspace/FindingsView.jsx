import React, { useState } from 'react';

export default function FindingsView({
  findings = [],
  onSelectFinding
}) {
  const [filter, setFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const criticalCount = findings.filter(f => f.severity === 'CRITICAL' && !f.isRepaired).length;
  const highCount = findings.filter(f => f.severity === 'HIGH' && !f.isRepaired).length;
  const mediumCount = findings.filter(f => f.severity === 'MEDIUM' && !f.isRepaired).length;
  const resolvedCount = findings.filter(f => f.isRepaired).length;

  const filteredFindings = findings.filter(f => {
    // Filter by tab
    if (filter === 'CRITICAL' && (f.severity !== 'CRITICAL' || f.isRepaired)) return false;
    if (filter === 'HIGH' && (f.severity !== 'HIGH' || f.isRepaired)) return false;
    if (filter === 'MEDIUM' && (f.severity !== 'MEDIUM' || f.isRepaired)) return false;
    if (filter === 'RESOLVED' && !f.isRepaired) return false;

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = f.title?.toLowerCase().includes(q);
      const matchDesc = f.description?.toLowerCase().includes(q);
      const matchFile = f.file?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchFile) return false;
    }

    return true;
  });

  return (
    <div className="flex-1 flex flex-col font-sans bg-[#090d16] text-slate-200 overflow-hidden">
      {/* Header & Filter Controls */}
      <div className="p-4 border-b border-[#263147] bg-[#0d131f] space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-white">Repository Findings</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Identified security issues, specification drift, and invariant violations.
            </p>
          </div>

          {/* Search bar */}
          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search findings or files..."
              className="w-full bg-[#111724] border border-[#263147] rounded-md px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8]"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto text-xs">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1 rounded-md font-medium transition ${
              filter === 'ALL'
                ? 'bg-[#1e293b] text-white border border-[#38bdf8]'
                : 'text-slate-400 hover:text-white hover:bg-[#111724]'
            }`}
          >
            All ({findings.length})
          </button>

          <button
            onClick={() => setFilter('CRITICAL')}
            className={`px-3 py-1 rounded-md font-medium transition flex items-center space-x-1.5 ${
              filter === 'CRITICAL'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-[#111724]'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <span>Critical ({criticalCount})</span>
          </button>

          <button
            onClick={() => setFilter('HIGH')}
            className={`px-3 py-1 rounded-md font-medium transition flex items-center space-x-1.5 ${
              filter === 'HIGH'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-[#111724]'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>High ({highCount})</span>
          </button>

          <button
            onClick={() => setFilter('MEDIUM')}
            className={`px-3 py-1 rounded-md font-medium transition flex items-center space-x-1.5 ${
              filter === 'MEDIUM'
                ? 'bg-blue-500/20 text-[#38bdf8] border border-blue-500/40 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-[#111724]'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            <span>Medium ({mediumCount})</span>
          </button>

          <button
            onClick={() => setFilter('RESOLVED')}
            className={`px-3 py-1 rounded-md font-medium transition flex items-center space-x-1.5 ${
              filter === 'RESOLVED'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-[#111724]'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Resolved ({resolvedCount})</span>
          </button>
        </div>
      </div>

      {/* Findings List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredFindings.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-500">
            <span className="text-xl">✓</span>
            <p className="text-xs">No findings matching the selected filter.</p>
          </div>
        ) : (
          filteredFindings.map((finding) => {
            const isCritical = finding.severity === 'CRITICAL';
            const isHigh = finding.severity === 'HIGH';

            return (
              <div
                key={finding.id}
                onClick={() => onSelectFinding(finding)}
                className="bg-[#0d131f] border border-[#263147] hover:border-[#38bdf8]/60 rounded-lg p-4 transition cursor-pointer space-y-3 shadow-sm group"
              >
                {/* Top Row: Severity, Category, Location, Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                      finding.isRepaired
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : isCritical
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : isHigh
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-blue-500/20 text-[#38bdf8] border border-blue-500/30'
                    }`}>
                      {finding.isRepaired ? 'REPAIRED' : finding.severity}
                    </span>

                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#111724] text-slate-400 border border-[#263147] font-medium">
                      {finding.category}
                    </span>

                    <span className="text-xs font-mono text-slate-400">
                      {finding.file}:{finding.line}
                    </span>
                  </div>

                  <span className={`text-[11px] font-medium ${
                    finding.isRepaired ? 'text-emerald-400' : 'text-slate-400'
                  }`}>
                    {finding.status}
                  </span>
                </div>

                {/* Finding Title & Short Explanation */}
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white group-hover:text-[#38bdf8] transition">
                    {finding.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {finding.description}
                  </p>
                </div>

                {/* Bottom Row: Actions */}
                <div className="pt-2 border-t border-[#1e293b] flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3 text-[11px] text-slate-500">
                    {finding.counterexample && (
                      <span className="flex items-center space-x-1 text-slate-400">
                        <span>•</span>
                        <span>Counterexample synthesized</span>
                      </span>
                    )}
                    {finding.patch && (
                      <span className="flex items-center space-x-1 text-emerald-400">
                        <span>•</span>
                        <span>Candidate patch available</span>
                      </span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectFinding(finding);
                    }}
                    className="text-xs font-semibold text-[#38bdf8] group-hover:translate-x-0.5 transition flex items-center space-x-1"
                  >
                    <span>View Finding</span>
                    <span>&rarr;</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
