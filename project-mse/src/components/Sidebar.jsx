import React from 'react';

export default function Sidebar({
  activeNav,
  onNavigate,
  repositoryName,
  findingsCount = 0,
  criticalCount = 0,
  patchesCount = 0,
  verificationStatus = 'PENDING',
  onChangeRepository,
  onToggleTechnical,
  isTechnicalOpen = false
}) {
  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      id: 'findings',
      label: 'Findings',
      badge: findingsCount > 0 ? findingsCount : null,
      badgeColor: criticalCount > 0 ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    {
      id: 'changes',
      label: 'Changes',
      badge: patchesCount > 0 ? patchesCount : null,
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      )
    },
    {
      id: 'runs',
      label: 'Runs',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      id: 'verification',
      label: 'Verification',
      badge: verificationStatus === 'VERIFIED' ? 'PASS' : null,
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    {
      id: 'report',
      label: 'Report',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      id: 'source',
      label: 'Code Explorer',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      )
    }
  ];

  return (
    <aside className="w-60 bg-[#0d131f] border-r border-[#263147] flex flex-col justify-between shrink-0 select-none">
      {/* Top Branding & Repo Switcher */}
      <div className="p-3.5 space-y-4">
        {/* Brand */}
        <div className="flex items-center space-x-2.5">
          <div className="h-7 w-7 rounded bg-[#1e293b] border border-[#334155] flex items-center justify-center font-mono font-bold text-xs text-[#38bdf8]">
            MSE
          </div>
          <div>
            <div className="text-xs font-bold text-white tracking-wide">Project MSE</div>
            <div className="text-[10px] text-slate-400 font-mono">Software Engine</div>
          </div>
        </div>

        {/* Current Repository Card */}
        <div className="bg-[#111724] border border-[#263147] rounded-md p-2.5 space-y-1.5">
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center justify-between">
            <span>Target Repo</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>
          <div className="text-xs font-bold text-slate-200 truncate font-mono" title={repositoryName}>
            {repositoryName || 'repository'}
          </div>
          <button
            onClick={onChangeRepository}
            className="w-full text-left text-[11px] text-[#38bdf8] hover:text-white transition flex items-center justify-between pt-1 border-t border-[#1e293b]"
          >
            <span>Change Repository</span>
            <span>&rarr;</span>
          </button>
        </div>

        {/* Primary Navigation Menu */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition ${
                  isActive
                    ? 'bg-[#1e293b] text-white shadow-sm border border-[#334155]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className={isActive ? 'text-[#38bdf8]' : 'text-slate-500'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge !== null && item.badge !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold border ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Technical Drawer Toggle */}
      <div className="p-3 border-t border-[#263147] bg-[#090d16] space-y-2">
        <button
          onClick={onToggleTechnical}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-mono transition border ${
            isTechnicalOpen
              ? 'bg-[#162032] border-[#38bdf8] text-[#38bdf8] font-bold'
              : 'bg-[#111724] border-[#263147] text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            <span className="text-[10px]">[&lt;/&gt;]</span>
            <span>Technical Analysis</span>
          </div>
          <span className="text-[10px]">{isTechnicalOpen ? '▲' : '▼'}</span>
        </button>

        <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 font-mono">
          <span>RAM Mode</span>
          <span className="text-emerald-400">Zero-Disk</span>
        </div>
      </div>
    </aside>
  );
}
