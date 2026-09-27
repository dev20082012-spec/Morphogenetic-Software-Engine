import React, { useState, useMemo } from 'react';

/**
 * Builds a nested folder tree from flat file list
 */
function buildTreeFromFiles(files = [], findings = [], patches = []) {
  const fileBadgeMap = {};

  for (const f of findings) {
    const evidenceList = [...(f.sourceEvidence || []), ...(f.documentationEvidence || [])];
    for (const ev of evidenceList) {
      if (ev.file && !fileBadgeMap[ev.file]) {
        fileBadgeMap[ev.file] = {
          text: f.severity === 'CRITICAL' ? 'CRITICAL' : f.type === 'drift' ? 'DRIFT' : 'FINDING',
          tone: f.severity === 'CRITICAL' ? 'danger' : 'warning',
        };
      }
    }
  }

  for (const p of patches) {
    if (p.targetFile && !fileBadgeMap[p.targetFile]) {
      fileBadgeMap[p.targetFile] = {
        text: 'PATCH READY',
        tone: 'success',
      };
    }
  }

  const root = { name: '', type: 'folder', path: '', children: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const partPath = parts.slice(0, i + 1).join('/');

      if (isFile) {
        current.children.push({
          name: part,
          path: file.path,
          type: 'file',
          language: file.language,
          badge: fileBadgeMap[file.path]?.text,
          badgeTone: fileBadgeMap[file.path]?.tone,
        });
      } else {
        let folder = current.children.find(c => c.type === 'folder' && c.name === part);
        if (!folder) {
          folder = {
            name: part,
            path: partPath,
            type: 'folder',
            children: [],
          };
          current.children.push(folder);
        }
        current = folder;
      }
    }
  }

  function sortNodes(node) {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      for (const child of node.children) {
        if (child.type === 'folder') sortNodes(child);
      }
    }
  }
  sortNodes(root);

  return root.children;
}

export default function FileTree({ 
  files = [], 
  activeFile, 
  onSelectFile, 
  patches = [],
  findings = [],
  onSelectDiff,
  activeDiffFile 
}) {
  const [search, setSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState({});

  const toggleFolder = (folderKey) => {
    setCollapsedFolders(prev => ({ ...prev, [folderKey]: !prev[folderKey] }));
  };

  const treeStructure = useMemo(() => {
    return buildTreeFromFiles(files, findings, patches);
  }, [files, findings, patches]);

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
        className={`w-full text-left px-2 py-1 rounded-sm flex items-center justify-between text-xs font-mono border transition ${
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
          <div className="space-y-0.5" style={{ paddingLeft: `${indent + 8}px` }}>
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
        <span className="text-[10px] font-mono text-slate-500">{files.length} Files</span>
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
        {treeStructure.map(item => {
          if (item.type === 'folder') return renderFolderItem(item, 0);
          return renderFileItem(item);
        })}
      </div>

      {patches.length > 0 && (
        <div className="p-2 border-t border-[#263147] bg-[#090d16] space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="font-semibold text-slate-300">
              REPAIR PATCHES ({patches.length})
            </span>
            <span className="text-[#4ade80] font-bold">READY</span>
          </div>

          <div className="space-y-1 max-h-32 overflow-y-auto">
            {patches.map(patch => (
              <button
                key={patch.id}
                onClick={() => onSelectDiff(patch.targetFile)}
                className={`w-full text-left px-2 py-1 text-[10px] font-mono rounded-sm border flex items-center justify-between transition ${
                  activeDiffFile === patch.targetFile
                    ? 'bg-[#1e293b] border-[#38bdf8] text-slate-100 font-bold'
                    : 'bg-[#111724] border-[#263147] text-slate-300 hover:text-white'
                }`}
              >
                <span className="truncate pr-1">[{patch.id}] {patch.targetFile.split('/').pop()}</span>
                <span className="text-[#4ade80] font-semibold shrink-0 uppercase text-[9px]">{patch.confidence}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
