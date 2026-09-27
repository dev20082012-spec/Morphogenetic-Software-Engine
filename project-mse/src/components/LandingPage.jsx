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
            <span>Autonomous In-Memory AST Homeostasis</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
            Morphogenetic Software Engine
          </h1>

          <p className="text-base text-slate-400 max-w-xl mx-auto">
            <span className="text-slate-200 font-semibold">Understand. Detect. Repair. Verify.</span>
            <br />
            Continuous code and specification reconciliation. Discovers hidden bugs, documentation drift, and unguarded endpoints—then synthesizes and verifies atomic repairs in memory.
          </p>
        </div>

        {/* Loading Overlay State if analyzing */}
        {isLoading ? (
          <div className="bg-[#0d131f] border border-[#263147] rounded-lg p-8 text-center space-y-4 shadow-xl">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-[#38bdf8] border-r-transparent" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">Analyzing Repository in RAM</h3>
              <p className="text-xs text-slate-400 font-mono">{statusMessage || 'Parsing AST and reconciling specifications...'}</p>
            </div>
          </div>
        ) : (
          /* Selection Options */
          <div className="space-y-4">
            {/* Primary Action: One-Click Canonical Demo */}
            <div className="bg-[#0d131f] border border-[#263147] hover:border-[#38bdf8]/60 transition rounded-lg p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs uppercase tracking-wider font-semibold text-[#38bdf8] bg-[#162032] px-2 py-0.5 rounded border border-[#24334d]">
                      Recommended
                    </span>
                    <h2 className="text-base font-bold text-white">Canonical Enterprise Fixture</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Realistic enterprise backend (<code className="text-slate-300">enterprise-payment-core</code>) with specification drift, unauthenticated webhook ingress, and invariant breaches.
                  </p>
                </div>

                <button
                  onClick={onSelectEnterpriseDemo}
                  className="px-4 py-2.5 rounded-md bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#090d16] font-bold text-xs shadow-md transition shrink-0 flex items-center space-x-1.5"
                >
                  <span>Analyze Demo Repository</span>
                  <span>&rarr;</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1e293b] text-[11px] text-slate-400">
                <div className="flex items-center space-x-1.5">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Port & Auth Drift</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Webhook Counterexample</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>CEGIS Repair & Verification</span>
                </div>
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

              {/* Option 3: GitHub Repository URL */}
              <div className="border border-[#263147] bg-[#0d131f] rounded-lg p-5 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                    <h3 className="text-sm font-semibold text-white">GitHub Repository URL</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Analyze a public repository directly in an ephemeral sandbox.
                  </p>
                </div>

                <form onSubmit={handleGithubSubmit} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/org/repo"
                    className="flex-1 bg-[#111724] border border-[#263147] rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-[#1e293b] hover:bg-[#334155] border border-[#263147] text-slate-200 hover:text-white text-xs font-semibold"
                  >
                    Analyze
                  </button>
                </form>
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
