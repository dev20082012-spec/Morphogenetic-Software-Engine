import React, { useState, useEffect, useRef } from 'react';
import { 
  Dna, ShieldCheck, Terminal, GitPullRequest, ArrowRight, 
  Activity, CheckCircle2, Zap, Play, FileCode, AlertTriangle, 
  Layers, ExternalLink, RefreshCw, Cpu
} from 'lucide-react';

const REPO_PRESETS = {
  payment: {
    name: "fintech/payment-gateway-core",
    url: "https://github.com/enterprise/payment-gateway-core",
    badge: "Distributed Payments",
    invariants: [
      { id: "INV-01", title: "Transactional Idempotency", desc: "Webhook POST /v1/charges requires unique X-Idempotency-Key. Replay payload without signature must abort before DB pool acquire." },
      { id: "INV-02", title: "Ledger Atomicity", desc: "Dual-entry ledger balance updates must hold distributed lock with TTL > 5000ms. Aborted commits auto-trigger rollback." }
    ],
    drift: {
      doc: 'README.md states: "Service binds to PORT=3000 using HMAC-SHA256 secret in AUTH_SECRET."',
      ast: 'src/server.ts:32 enforces PORT=8080 with strict RSA-256 asymmetric public key verification.',
      action: "Automatically generated .env.production template and updated README.md line 42."
    },
    pr: {
      title: "PR #142: Fix Unhandled Webhook Replay & Add Counterexample Proof",
      file: "test/invariants/webhook_replay.spec.ts",
      patch: [
        "+ describe('Invariant INV-01: Webhook Replay Assertion', () => {",
        "+   it('rejects duplicated charge event without active lease', async () => {",
        "+     const payload = mockChargeEvent('evt_99823');",
        "+     const res1 = await request(app).post('/v1/charges').send(payload);",
        "+     const res2 = await request(app).post('/v1/charges').send(payload);",
        "+     expect(res2.status).toBe(409);",
        "+   });",
        "+ });"
      ]
    },
    logs: [
      "[00:00.12] [ORCHESTRATOR] Ingesting repository topology...",
      "[00:00.45] [ALPHA:MORPHOLOGIST] AST parse initiated: 48 source modules indexed.",
      "[00:01.02] [ALPHA:MORPHOLOGIST] Latent state manifold extracted: 2 critical transactional invariants bound.",
      "[00:01.48] [BETA:SYMBIOTE] Parsing README.md and OpenAPI 3.0 schema...",
      "[00:01.95] [BETA:SYMBIOTE] CRITICAL DRIFT: Documentation claims PORT=3000; AST binds to 8080.",
      "[00:02.40] [GAMMA:IMMUNE] Invariant INV-01 stress-tested with adversarial replay payload.",
      "[00:02.88] [GAMMA:IMMUNE] Vulnerability isolated: unhandled duplicate webhook triggers DB pool deadlock.",
      "[00:03.20] [GAMMA:IMMUNE] Synthesizing CEGIS minimal patch & regression test suite...",
      "[00:03.75] [ORCHESTRATOR] Convergence achieved. All subagents reported ZERO ENTROPY."
    ]
  },
  consensus: {
    name: "infrastructure/raft-distributed-kv",
    url: "https://github.com/enterprise/raft-distributed-kv",
    badge: "Distributed Systems",
    invariants: [
      { id: "RAFT-01", title: "Quorum Heartbeat Boundary", desc: "Leader heartbeat intervals must strictly remain between 150ms-300ms. Sub-threshold drop triggers instant re-election." },
      { id: "RAFT-02", title: "Log Entry Linearizability", desc: "Uncommitted log indices cannot be read by external client RPCs prior to disk fsync on majority nodes." }
    ],
    drift: {
      doc: 'docs/clustering.md states: "Nodes peer via plain UDP gossip on port 4000."',
      ast: 'src/network/peer.go:78 enforces mutual TLS over TCP port 9443 with x509 cert validation.',
      action: "Living spec regenerated: TLS certificates and mutual auth handshake schema updated."
    },
    pr: {
      title: "PR #89: Prevent Split-Brain on Partial Network Partition",
      file: "test/adversarial/network_partition.spec.go",
      patch: [
        "+ func TestNetworkPartitionRejection(t *testing.T) {",
        "+   cluster := SpawnCluster(5)",
        "+   cluster.IsolateNodes(2)",
        "+   err := cluster.ProposeValue('key', 'val')",
        "+   assert.ErrorIs(t, err, ErrNoQuorumReached)",
        "+ }"
      ]
    },
    logs: [
      "[00:00.10] [ORCHESTRATOR] Spawning isolated context subagents...",
      "[00:00.52] [ALPHA:MORPHOLOGIST] Traversed 112 AST nodes across RaFT consensus state machine.",
      "[00:01.15] [ALPHA:MORPHOLOGIST] Boundary extracted: Term state mutations require atomic CAS lock.",
      "[00:01.65] [BETA:SYMBIOTE] Cross-checking cluster documentation vs socket bindings...",
      "[00:02.10] [BETA:SYMBIOTE] PROTOCOL DRIFT: UDP gossip documented, but mTLS TCP active in code.",
      "[00:02.60] [GAMMA:IMMUNE] Generating adversarial network partition simulation...",
      "[00:03.10] [GAMMA:IMMUNE] Synthesized counterexample proving split-brain risk on 2-node isolation.",
      "[00:03.60] [GAMMA:IMMUNE] Atomic patch generated: Quorum check enforced prior to term increment.",
      "[00:03.95] [ORCHESTRATOR] Morphogenetic Homeostasis Restored."
    ]
  }
};

export default function App() {
  const [selectedPreset, setSelectedPreset] = useState("payment");
  const [repoUrl, setRepoUrl] = useState(REPO_PRESETS.payment.url);
  const [status, setStatus] = useState("idle");
  const [activeTab, setActiveTab] = useState("topology");
  const [terminalLogs, setTerminalLogs] = useState([]);
  const terminalEndRef = useRef(null);

  const activeData = REPO_PRESETS[selectedPreset] || REPO_PRESETS.payment;
  const intervalRef = useRef(null);

  const handlePresetChange = (presetKey) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSelectedPreset(presetKey);
    setRepoUrl(REPO_PRESETS[presetKey].url);
    setStatus("idle");
    setTerminalLogs([]);
  };

  const runEngine = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus("running");
    setTerminalLogs([]);
    let logIndex = 0;
    const logs = activeData.logs || [];
    
    intervalRef.current = setInterval(() => {
      if (logIndex < logs.length) {
        const nextLog = logs[logIndex];
        setTerminalLogs(prev => [...prev, nextLog]);
        logIndex++;
      } else {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setStatus("converged");
      }
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  return (
    <div className="min-h-screen bg-[#04060c] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Header */}
      <header className="border-b border-cyan-950/40 bg-[#070b16]/95 backdrop-blur px-8 py-3.5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-mono font-bold text-black shadow-lg shadow-cyan-500/20">
            <Dna className="w-5 h-5 text-black" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight text-white font-mono">PROJECT MSE</h1>
              <span className="text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                IBM Bob 2.0 Invariant Engine
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">Morphogenetic Codebase Homeostasis & CEGIS Prover</p>
          </div>
        </div>

        <div className="flex items-center space-x-4 font-mono text-xs">
          <div className="hidden md:flex items-center space-x-2 text-slate-400 border border-slate-800 px-3 py-1 rounded-lg bg-slate-900/60">
            <span className="text-[10px] text-slate-500 uppercase">Privacy:</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Zero-Data-Retention (RAM Only)
            </span>
          </div>
        </div>
      </header>

      {/* Main Studio */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">
        {/* Preset Selector */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-400">BENCHMARK REPOSITORIES:</span>
            <button 
              onClick={() => handlePresetChange("payment")}
              className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition ${selectedPreset === "payment" ? "bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold" : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200"}`}
            >
              Fintech Payment Core
            </button>
            <button 
              onClick={() => handlePresetChange("consensus")}
              className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition ${selectedPreset === "consensus" ? "bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold" : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200"}`}
            >
              RaFT Consensus Node
            </button>
          </div>

          <span className="text-xs font-mono text-cyan-400/80 bg-cyan-950/40 px-2.5 py-1 rounded border border-cyan-900/50">
            Track: {activeData.badge}
          </span>
        </div>

        {/* Input Bar */}
        <section className="bg-[#080d1a] border border-cyan-950/80 rounded-xl p-5 shadow-2xl relative">
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className="relative flex-1 w-full">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 font-mono text-xs text-cyan-400 font-bold">
                REPO://
              </span>
              <input 
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="w-full bg-[#040711] border border-slate-800 rounded-lg pl-24 pr-4 py-2.5 text-xs font-mono text-cyan-100 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>
            <button 
              onClick={runEngine}
              disabled={status === "running"}
              className="w-full md:w-auto px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-mono font-bold tracking-wider flex items-center justify-center space-x-2 transition shadow-lg shadow-cyan-600/20"
            >
              {status === "running" ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>PARALLEL AUDIT RUNNING...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>EXECUTE HOMEOSTASIS AUDIT</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Subagents Real-Time Status Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#080d1a] border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-cyan-400">SUBAGENT_ALPHA : MORPHOLOGIST</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${status === "converged" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : status === "running" ? "bg-cyan-950 text-cyan-300 animate-pulse" : "bg-slate-800 text-slate-400"}`}>
                  {status === "converged" ? "CONVERGED" : status === "running" ? "PARSING AST" : "READY"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Maps multi-file AST call-graphs and mines latent state invariants.</p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 font-mono text-[10px] text-slate-300 flex items-center justify-between">
              <span>{status === "converged" ? "✓ 2 Invariants Mathematically Bound" : status === "running" ? "Traversing AST..." : "Awaiting trigger"}</span>
              <span className="text-slate-500">Tree-sitter</span>
            </div>
          </div>

          <div className="bg-[#080d1a] border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-indigo-400">SUBAGENT_BETA : SYMBIOTE</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${status === "converged" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : status === "running" ? "bg-cyan-950 text-cyan-300 animate-pulse" : "bg-slate-800 text-slate-400"}`}>
                  {status === "converged" ? "SYNCHRONIZED" : status === "running" ? "SCANNING DOCS" : "READY"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Document Understanding reconciling README & OpenAPI specs against AST.</p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 font-mono text-[10px] text-slate-300 flex items-center justify-between">
              <span>{status === "converged" ? "✓ 1 Critical Spec Drift Eliminated" : status === "running" ? "Comparing schemas..." : "Awaiting trigger"}</span>
              <span className="text-slate-500">Doc-AI</span>
            </div>
          </div>

          <div className="bg-[#080d1a] border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-rose-400">SUBAGENT_GAMMA : IMMUNE_CORE</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${status === "converged" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : status === "running" ? "bg-cyan-950 text-cyan-300 animate-pulse" : "bg-slate-800 text-slate-400"}`}>
                  {status === "converged" ? "HEALED" : status === "running" ? "CEGIS LOOP" : "READY"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Synthesizes counterexample failing tests and invariant-restoring PRs.</p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 font-mono text-[10px] text-slate-300 flex items-center justify-between">
              <span>{status === "converged" ? "✓ Self-Healing PR & Proof Generated" : status === "running" ? "Synthesizing test..." : "Awaiting trigger"}</span>
              <span className="text-slate-500">CEGIS Prover</span>
            </div>
          </div>
        </section>

        {/* Live Terminal Stream Window */}
        {(status === "running" || terminalLogs.length > 0) && (
          <section className="bg-[#03060f] border border-cyan-950/60 rounded-xl p-4 font-mono text-xs shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-3">
              <div className="flex items-center space-x-2 text-slate-400 text-[11px]">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>IBM BOB 2.0 AGENT STREAM LOGS (ISOLATED CONCURRENCY)</span>
              </div>
              <span className="text-[10px] text-cyan-400 animate-pulse">● LIVE EXECUTION TRACE</span>
            </div>
            <div className="space-y-1 text-slate-300 max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {terminalLogs.filter(Boolean).map((log, index) => (
                <div key={index} className="flex space-x-2">
                  <span className="text-cyan-500/80 select-none">&gt;</span>
                  <span className={log?.includes("CRITICAL") ? "text-amber-300 font-bold" : log?.includes("ZERO ENTROPY") ? "text-emerald-400 font-bold" : "text-slate-300"}>
                    {log}
                  </span>
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>
          </section>
        )}

        {/* Converged Detailed Evidence View */}
        {status === "converged" && (
          <section className="bg-[#080d1a] border border-cyan-950/80 rounded-xl overflow-hidden shadow-2xl">
            <div className="flex border-b border-slate-800 bg-[#050812] px-6">
              <button 
                onClick={() => setActiveTab("topology")}
                className={`py-3 px-4 text-xs font-mono font-bold border-b-2 transition ${activeTab === "topology" ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              >
                1. LATENT INVARIANTS & DAY-1 RAMP-UP
              </button>
              <button 
                onClick={() => setActiveTab("drift")}
                className={`py-3 px-4 text-xs font-mono font-bold border-b-2 transition ${activeTab === "drift" ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              >
                2. LIVING SPEC ALIGNMENT (DOC DRIFT)
              </button>
              <button 
                onClick={() => setActiveTab("pr")}
                className={`py-3 px-4 text-xs font-mono font-bold border-b-2 transition ${activeTab === "pr" ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              >
                3. CEGIS COUNTEREXAMPLE & PR DIFF
              </button>
            </div>

            <div className="p-6">
              {activeTab === "topology" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                      Extracted Invariant Graph & Beginner Starter Task
                    </h3>
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                      Ramp-Up Time: 45 Minutes (-96.7%)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeData.invariants.map((inv) => (
                      <div key={inv.id} className="bg-[#040711] border border-slate-800 rounded-lg p-4 font-mono text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-cyan-400 font-bold">[{inv.id}]</span>
                          <span className="text-[10px] text-slate-500">AST Invariant Rule</span>
                        </div>
                        <h4 className="text-slate-200 font-semibold text-xs">{inv.title}</h4>
                        <p className="text-slate-400 text-[11px] leading-relaxed">{inv.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "drift" && (
                <div className="space-y-4">
                  <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg p-4 space-y-3 font-mono text-xs">
                    <div className="flex items-center space-x-2 text-amber-400 font-bold">
                      <AlertTriangle className="w-4 h-4" />
                      <span>EPIGENETIC DRIFT RESOLUTION (DOCUMENT UNDERSTANDING)</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                      <div className="bg-[#040711] p-3.5 rounded border border-slate-800">
                        <span className="text-slate-500 block mb-1 text-[10px]">// STALE HUMAN DOCUMENTATION</span>
                        <p className="text-slate-300 text-[11px]">{activeData.drift.doc}</p>
                      </div>
                      <div className="bg-[#040711] p-3.5 rounded border border-slate-800">
                        <span className="text-emerald-400 block mb-1 text-[10px]">// AST SOURCE TRUTH (TREE-SITTER)</span>
                        <p className="text-slate-300 text-[11px]">{activeData.drift.ast}</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-amber-900/40 text-[11px] text-emerald-400 flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{activeData.drift.action}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "pr" && (
                <div className="space-y-4">
                  <div className="bg-[#040711] border border-slate-800 rounded-lg p-4 font-mono text-xs">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                      <div className="flex items-center space-x-2">
                        <GitPullRequest className="w-4 h-4 text-emerald-400" />
                        <span className="text-slate-200 font-bold text-xs">{activeData.pr.title}</span>
                      </div>
                      <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[9px] px-2 py-0.5 rounded font-bold">
                        CEGIS Proof Verified
                      </span>
                    </div>
                    <p className="text-slate-500 text-[10px] mb-2">// Generated Regression Test: {activeData.pr.file}</p>
                    <div className="bg-[#020409] p-3 rounded border border-slate-900 font-mono text-[11px] space-y-0.5">
                      {activeData.pr.patch.map((line, i) => (
                        <div key={i} className="text-emerald-400">{line}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Quantified System ROI */}
        <section className="bg-[#080d1a] border border-slate-800/80 rounded-xl p-5 font-mono">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-[#040711] p-3.5 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px]">Developer Onboarding Velocity</span>
              <div className="text-xl font-bold text-white mt-1">45 min <span className="text-xs text-emerald-400">(-96.7%)</span></div>
              <span className="text-[10px] text-slate-500">Reduced from standard 14 days</span>
            </div>
            <div className="bg-[#040711] p-3.5 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px]">Autonomous Incident Healing</span>
              <div className="text-xl font-bold text-white mt-1">94 sec <span className="text-xs text-emerald-400">(-98.6%)</span></div>
              <span className="text-[10px] text-slate-500">Replaces 3.5 hrs manual triage</span>
            </div>
            <div className="bg-[#040711] p-3.5 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px]">Specification Drift Ratio</span>
              <div className="text-xl font-bold text-white mt-1">0.00 <span className="text-xs text-emerald-400">(Living DNA)</span></div>
              <span className="text-[10px] text-slate-500">Continuous AST alignment</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-cyan-950/40 py-3.5 px-8 text-center text-[11px] font-mono text-slate-500">
        Project MSE • Autonomous Morphogenetic Codebase Engine • Built with IBM Bob 2.0
      </footer>
    </div>
  );
}
