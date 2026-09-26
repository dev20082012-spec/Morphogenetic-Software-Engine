import React, { useState } from 'react';

export default function FileTree({ 
  files, 
  activeFile, 
  onSelectFile, 
  activeDiffFile, 
  onSelectDiff 
}) {
  const [search, setSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState({
    'src/controllers': false,
    'src/routes': false,
    'src/db': false,
    'src': false,
    'contracts': false,
    'specs': false,
    'invariants': false,
    'cegis-antigens': false
  });

  const toggleFolder = (folderKey) => {
    setCollapsedFolders(prev => ({ ...prev, [folderKey]: !prev[folderKey] }));
  };

  const treeStructure = [
    {
      name: 'src',
      type: 'folder',
      path: 'src',
      children: [
        {
          name: 'routes',
          type: 'folder',
          path: 'src/routes',
          children: [
            files['src/routes/webhook.js'],
            files['src/routes/users.js'],
            files['src/routes/orders.js'],
          ]
        },
        {
          name: 'controllers',
          type: 'folder',
          path: 'src/controllers',
          children: [
            files['src/controllers/webhookController.js'],
            files['src/controllers/usersController.js'],
            files['src/controllers/ordersController.js'],
          ]
        },
        {
          name: 'db',
          type: 'folder',
          path: 'src/db',
          children: [
            files['src/db/pool.js'],
          ]
        }
      ]
    },
    {
      name: 'contracts',
      type: 'folder',
      path: 'contracts',
      children: [
        files['contracts/IdempotencyLease.ts'],
        files['contracts/RaftConsensus.proto'],
      ]
    },
    {
      name: 'invariants',
      type: 'folder',
      path: 'invariants',
      children: [
        files['invariants/discovered_invariants.json'],
      ]
    },
    {
      name: 'specs',
      type: 'folder',
      path: 'specs',
      children: [
        files['specs/openapi.yaml'],
        files['specs/README.md'],
      ]
    },
    {
      name: 'cegis-antigens',
      type: 'folder',
      path: 'cegis-antigens',
      children: [
        files['cegis-antigens/INV-001.antigen.test.js'],
      ]
    }
  ];

  const renderFileItem = (file) => {
    if (!file) return null;
    if (search && !file.name.toLowerCase().includes(search.toLowerCase()) && !file.path.toLowerCase().includes(search.toLowerCase())) {
      return null;
    }

    const isActive = activeFile === file.path;

    return (
      <button
        key={file.path}
        onClick={() => onSelectFile(file.path)}
        className={`w-full text-left px-2 py-1 rounded-sm flex items-center justify-between text-xs font-mono border ${
          isActive 
            ? 'bg-[#1e293b] text-slate-100 font-semibold border-[#38bdf8]' 
            : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724] border-transparent'
        }`}
      >
        <div className="flex items-center space-x-1.5 truncate pr-1">
          <span className="text-[10px] text-slate-500 font-mono">FILE</span>
          <span className="truncate">{file.name}</span>
        </div>

        {file.badge && (
          <span 
            className={`text-[9px] px-1 py-0.2 rounded-sm font-semibold shrink-0 uppercase border ${
              file.badgeTone === 'danger'
                ? 'bg-[#2a1215] text-[#f87171] border-[#7f1d1d]' 
                : file.badgeTone === 'warning'
                ? 'bg-[#291e0b] text-[#fbbf24] border-[#78350f]'
                : 'bg-[#13281c] text-[#4ade80] border-[#166534]'
            }`}
          >
            {file.badge}
          </span>
        )}
      </button>
    );
  };

  const renderFolderItem = (folder, depth = 0) => {
    const isCollapsed = collapsedFolders[folder.path];
    const indent = depth * 10;

    return (
      <div key={folder.path} className="space-y-0.5">
        <button
          onClick={() => toggleFolder(folder.path)}
          style={{ paddingLeft: `${indent + 6}px` }}
          className="w-full text-left py-1 px-1.5 rounded-sm flex items-center space-x-1.5 text-xs font-mono text-slate-300 hover:text-white hover:bg-[#111724]"
        >
          <span className="text-[10px] text-slate-500 font-mono">
            {isCollapsed ? '[+]' : '[-]'}
          </span>
          <span className="font-semibold text-slate-200">{folder.name}/</span>
        </button>

        {!isCollapsed && (
          <div className="space-y-0.5" style={{ paddingLeft: `${indent + 10}px` }}>
            {folder.children.map(child => {
              if (child.type === 'folder') {
                return renderFolderItem(child, depth + 1);
              }
              return renderFileItem(child);
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-60 border-r border-[#263147] bg-[#0d131f] flex flex-col h-full shrink-0 select-none">
      <div className="p-2.5 border-b border-[#263147] flex items-center justify-between">
        <span className="text-[11px] font-mono font-bold text-slate-200 uppercase tracking-wider">
          CODEBASE EXPLORER
        </span>
        <span className="text-[10px] font-mono text-slate-500">12 Files</span>
      </div>

      <div className="p-2 border-b border-[#263147] bg-[#090d16]">
        <input
          type="text"
          placeholder="Filter files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#111724] border border-[#263147] rounded-sm px-2 py-1 text-[11px] font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#38bdf8]"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {treeStructure.map(item => renderFolderItem(item, 0))}
      </div>

      <div className="p-2 border-t border-[#263147] bg-[#090d16] space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span className="font-semibold text-slate-300">
            AUTO-PATCHES (3)
          </span>
          <span className="text-slate-500">CEGIS</span>
        </div>
        <div className="space-y-1">
          <button
            onClick={() => onSelectDiff('src/routes/webhook.js')}
            className={`w-full text-left px-2 py-1 text-[10px] font-mono rounded-sm border flex items-center justify-between ${
              activeDiffFile === 'src/routes/webhook.js'
                ? 'bg-[#1e293b] border-[#38bdf8] text-slate-100 font-bold'
                : 'bg-[#111724] border-[#263147] text-slate-300 hover:text-white'
            }`}
          >
            <span>PR #142: Webhook HMAC</span>
            <span className="text-[#4ade80] font-bold">READY</span>
          </button>
          <button
            onClick={() => onSelectDiff('src/db/pool.js')}
            className={`w-full text-left px-2 py-1 text-[10px] font-mono rounded-sm border flex items-center justify-between ${
              activeDiffFile === 'src/db/pool.js'
                ? 'bg-[#1e293b] border-[#38bdf8] text-slate-100 font-bold'
                : 'bg-[#111724] border-[#263147] text-slate-300 hover:text-white'
            }`}
          >
            <span>PR #143: RAII Rollback</span>
            <span className="text-[#4ade80] font-bold">READY</span>
          </button>
          <button
            onClick={() => onSelectDiff('specs/README.md')}
            className={`w-full text-left px-2 py-1 text-[10px] font-mono rounded-sm border flex items-center justify-between ${
              activeDiffFile === 'specs/README.md'
                ? 'bg-[#1e293b] border-[#38bdf8] text-slate-100 font-bold'
                : 'bg-[#111724] border-[#263147] text-slate-300 hover:text-white'
            }`}
          >
            <span>PR #144: Port Drift</span>
            <span className="text-[#fbbf24] font-bold">RECONCILED</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
