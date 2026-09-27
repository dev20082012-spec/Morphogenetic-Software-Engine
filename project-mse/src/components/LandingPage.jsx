import React, { useState, useRef } from 'react';

export default function LandingPage({
  onSelectEnterpriseDemo,
  onSelectDemo,
  onUploadZip,
  onAnalyzeGithub,
  isLoading = false,
  statusMessage = ''
}) {
  const [githubUrl, setGithubUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      onUploadZip(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadZip(file);
      e.target.value = '';
    }
  };

  const handleGithubSubmit = (e) => {
    e.preventDefault();
    if (githubUrl.trim()) {
      onAnalyzeGithub(githubUrl.trim());
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#090d16] text-slate-100 overflow-y-auto">
      <div className="w-full max-w-3xl space-y-8 py-8">
        {/* Brand & Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#162032] border border-[#24334d] text-[#38bdf8] text-xs font-mono mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
            <span>Analyze safely in memory</span>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-semibold tracking-wide text-[#38bdf8]">Project MSE</div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
              Morphogenetic Software Engine
            </h1>
          </div>

          <p className="text-base text-slate-400 max-w-xl mx-auto">
            <span className="text-slate-200 font-semibold">Understand. Detect. Repair. Verify.</span>
            <br />
            Find issues, review evidence, apply fixes, and verify the result without changing files on disk.
          </p>
        </div>

        {/* Loading Overlay State if analyzing */}
        {isLoading ? (
          <div className="bg-[#0d131f] border border-[#263147] rounded-lg p-8 text-center space-y-4 shadow-xl">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-[#38bdf8] border-r-transparent" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">Analyzing Repository in RAM</h3>
              <p className="text-xs text-slate-400">{statusMessage || 'Preparing analysis...'}</p>
            </div>
          </div>
        ) : (
          /* Selection Options */
          <div className="space-y-4">
            {/* Primary action: analyze a repository */}
            <div className="bg-[#0d131f] border border-[#263147] hover:border-[#38bdf8]/60 transition rounded-lg p-6 space-y-4 shadow-xl">
              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-bold text-white">Analyze repository</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Paste a public GitHub URL to understand the codebase, find issues, and review safe fixes.
                  </p>
                </div>

                <form onSubmit={handleGithubSubmit} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/org/repo"
                    className="min-w-0 flex-1 bg-[#111724] border border-[#263147] rounded px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8]"
                  />
                  <button
                    type="submit"
                    disabled={!githubUrl.trim()}
                    className="px-4 py-2 rounded bg-[#38bdf8] hover:bg-[#0ea5e9] disabled:opacity-40 disabled:cursor-not-allowed text-[#090d16] font-bold text-xs shadow-md transition"
                  >
                    Analyze repository
                  </button>
                </form>
              </div>
            </div>

            {/* Secondary Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 2: Upload ZIP */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border rounded-lg p-5 cursor-pointer transition flex flex-col justify-between space-y-3 ${
                  isDragging
                    ? 'border-[#38bdf8] bg-[#162032]'
                    : 'border-[#263147] bg-[#0d131f] hover:border-slate-500'
                }`}
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-[#38bdf8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <h3 className="text-sm font-semibold text-white">Upload Repository ZIP</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Drag and drop a project archive or browse. Safe in-memory parsing with Zip Slip and decompression bomb protection.
                  </p>
                </div>

                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Max 50MB • JS/TS Projects</span>
                  <span className="text-[#38bdf8] font-medium">Browse files &rarr;</span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Option 3: Demo repository */}
              <div className="border border-[#263147] bg-[#0d131f] rounded-lg p-5 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Try the demo</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Explore a prepared payment service example with known issues and fixes.
                  </p>
                </div>
                <button onClick={onSelectEnterpriseDemo} className="self-start px-3 py-1.5 rounded bg-[#1e293b] hover:bg-[#334155] border border-[#263147] text-slate-200 text-xs font-semibold">
                  Try demo
                </button>
              </div>
            </div>

            {/* Alternative lightweight demo */}
            <div className="text-center pt-2">
              <button
                onClick={onSelectDemo}
                className="text-xs text-slate-400 hover:text-slate-200 underline transition"
              >
                Or try lightweight demo (<code className="text-slate-300">payment-gateway</code>) &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
